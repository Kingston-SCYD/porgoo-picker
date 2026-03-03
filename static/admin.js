const socket = io();
const overlay = document.querySelector("#overlay");

const state = {
  entities: new Map(),
  lastTimestamp: performance.now(),
  grabbedKey: null,
  pointer: { x: 0, y: 0, lastX: 0, lastY: 0, lastT: performance.now() },
  lastEmitAt: 0,
};

function randomJumpDelay() {
  return 0.9 + Math.random() * 0.8;
}

function createEntity(char, width) {
  const node = document.createElement("div");
  node.className = "character draggable";

  const facing = document.createElement("div");
  facing.className = "facing";

  const stack = document.createElement("div");
  stack.className = "stack";

  const body = document.createElement("img");
  body.className = "layer body";
  stack.appendChild(body);

  const eyes = document.createElement("img");
  eyes.className = "layer eyes";
  stack.appendChild(eyes);

  const mouth = document.createElement("img");
  mouth.className = "layer mouth";
  stack.appendChild(mouth);

  const name = document.createElement("div");
  name.className = "name";

  facing.appendChild(stack);
  node.appendChild(facing);
  node.appendChild(name);
  overlay.appendChild(node);

  const key = char.username.toLowerCase();
  node.dataset.key = key;

  return {
    key,
    node,
    facing,
    stack,
    body,
    eyes,
    mouth,
    name,
    x: Math.random() * Math.max(width - char.size, 1),
    y: 0,
    vy: 0,
    vx: 0,
    dir: Math.random() > 0.5 ? 1 : -1,
    nextJumpIn: randomJumpDelay(),
    grabbed: false,
  };
}

function applyCharacterVisuals(entity, char) {
  entity.character = char;
  entity.stack.style.width = `${char.size}px`;
  entity.stack.style.height = `${char.size}px`;

  entity.body.src = `/asset/body/${encodeURIComponent(char.body)}`;
  entity.body.style.filter = `hue-rotate(${char.hue}deg) saturate(${char.saturation}%) brightness(${char.brightness}%)`;

  if (char.eyes) {
    entity.eyes.src = `/asset/eyes/${encodeURIComponent(char.eyes)}`;
    entity.eyes.style.display = "block";
  } else {
    entity.eyes.style.display = "none";
  }

  if (char.mouth) {
    entity.mouth.src = `/asset/mouth/${encodeURIComponent(char.mouth)}`;
    entity.mouth.style.display = "block";
  } else {
    entity.mouth.style.display = "none";
  }

  entity.name.textContent = char.username;
}

function emitState(entity) {
  const now = performance.now();
  if (now - state.lastEmitAt < 30) return;
  state.lastEmitAt = now;

  socket.emit("admin_update_character_state", {
    username: entity.character.username,
    x: entity.x,
    y: entity.y,
    vx: entity.vx,
    vy: entity.vy,
    dir: entity.dir,
  });
}

function upsertCharacters(characters) {
  const nextKeys = new Set(characters.map((char) => char.username.toLowerCase()));

  for (const [key, value] of state.entities.entries()) {
    if (!nextKeys.has(key)) {
      value.node.remove();
      state.entities.delete(key);
      if (state.grabbedKey === key) {
        state.grabbedKey = null;
      }
    }
  }

  const width = window.innerWidth;

  for (const char of characters) {
    const key = char.username.toLowerCase();
    let entity = state.entities.get(key);

    if (!entity) {
      entity = createEntity(char, width);
      state.entities.set(key, entity);
    }

    applyCharacterVisuals(entity, char);
  }
}

function applyExternalState(update) {
  const key = (update.username || "").toLowerCase();
  const entity = state.entities.get(key);
  if (!entity || entity.grabbed || !entity.character) return;

  const maxX = Math.max(window.innerWidth - entity.character.size, 0);
  entity.x = Math.max(0, Math.min(Number(update.x) || 0, maxX));
  entity.y = Math.min(0, Number(update.y) || 0);
  entity.vx = Number(update.vx) || 0;
  entity.vy = Number(update.vy) || 0;
  entity.dir = Number(update.dir) >= 0 ? 1 : -1;
}

function toEntityY(size, clientY) {
  const fromBottom = window.innerHeight - clientY;
  const bottomAboveGround = Math.max(0, fromBottom - size * 0.5);
  return -bottomAboveGround;
}

function onPointerMove(event) {
  const now = performance.now();
  state.pointer.lastX = state.pointer.x;
  state.pointer.lastY = state.pointer.y;
  state.pointer.lastT = now;
  state.pointer.x = event.clientX;
  state.pointer.y = event.clientY;

  if (!state.grabbedKey) return;
  const entity = state.entities.get(state.grabbedKey);
  if (!entity || !entity.character) return;

  const maxX = Math.max(window.innerWidth - entity.character.size, 0);
  entity.x = Math.max(0, Math.min(state.pointer.x - entity.character.size / 2, maxX));
  entity.y = Math.min(0, toEntityY(entity.character.size, state.pointer.y));

  const dt = Math.max((now - state.pointer.lastT) / 1000, 0.001);
  const vx = (state.pointer.x - state.pointer.lastX) / dt;
  const vy = (state.pointer.y - state.pointer.lastY) / dt;
  entity.vx = vx * 0.75;
  entity.vy = vy * 0.75;
  entity.dir = entity.vx >= 0 ? 1 : -1;

  emitState(entity);
}

function releaseGrab() {
  if (!state.grabbedKey) return;
  const entity = state.entities.get(state.grabbedKey);
  state.grabbedKey = null;
  overlay.classList.remove("dragging");
  if (!entity) return;
  entity.grabbed = false;

  entity.vy = Math.max(-520, Math.min(420, entity.vy));
  entity.vx = Math.max(-420, Math.min(420, entity.vx));
  emitState(entity);
}

function onPointerDown(event) {
  const node = event.target.closest(".character");
  if (!node) return;

  const key = node.dataset.key;
  const entity = state.entities.get(key);
  if (!entity) return;

  if (event.button === 2) {
    event.preventDefault();
    socket.emit("admin_remove_character", { username: entity.character.username });
    return;
  }

  if (event.button !== 0) return;

  state.grabbedKey = key;
  entity.grabbed = true;
  entity.vx = 0;
  entity.vy = 0;
  overlay.classList.add("dragging");
  onPointerMove(event);
}

function tick(now) {
  const dt = Math.min((now - state.lastTimestamp) / 1000, 0.05);
  state.lastTimestamp = now;

  const width = window.innerWidth;

  for (const entity of state.entities.values()) {
    const { character } = entity;
    if (!character) continue;

    const maxX = Math.max(width - character.size, 0);

    if (!entity.grabbed) {
      entity.nextJumpIn -= dt;
      if (entity.y === 0 && entity.nextJumpIn <= 0) {
        if (entity.x <= 0) {
          entity.dir = 1;
        } else if (entity.x >= maxX) {
          entity.dir = -1;
        }

        const hopSpeed = character.speed * 105;
        entity.vx = entity.dir * hopSpeed;
        entity.vy = -(155 + Math.random() * 55);
        entity.nextJumpIn = randomJumpDelay();
      }

      if (entity.y < 0 || entity.vy < 0 || Math.abs(entity.vx) > 1) {
        entity.x += entity.vx * dt;
      }

      if (entity.x <= 0) {
        entity.x = 0;
        entity.dir = 1;
        entity.vx = Math.abs(entity.vx) * 0.72;
      } else if (entity.x >= maxX) {
        entity.x = maxX;
        entity.dir = -1;
        entity.vx = -Math.abs(entity.vx) * 0.72;
      }

      entity.vy += 540 * dt;
      entity.y += entity.vy * dt;

      if (entity.y > 0) {
        entity.y = 0;
        entity.vy = 0;
        entity.vx *= 0.45;
      }

      if (entity.y === 0) {
        entity.vx *= Math.pow(0.12, dt);
        if (Math.abs(entity.vx) < 2.5) {
          entity.vx = 0;
        }
      }
    }

    const rising = Math.max(-entity.vy / 240, 0);
    const falling = Math.max(entity.vy / 260, 0);
    const squishX = Math.max(0.9, Math.min(1.1, 1 + rising * 0.03 - falling * 0.05));
    const squishY = Math.max(0.9, Math.min(1.1, 1 - rising * 0.05 + falling * 0.07));

    entity.node.style.transform = `translate(${entity.x}px, ${entity.y}px)`;
    entity.facing.style.transform = `scaleX(${entity.dir === 1 ? -1 : 1})`;
    entity.stack.style.transform = `scale(${squishX}, ${squishY})`;

    emitState(entity);
  }

  requestAnimationFrame(tick);
}

window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", releaseGrab);
window.addEventListener("pointercancel", releaseGrab);
overlay.addEventListener("pointerdown", onPointerDown);
overlay.addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("resize", () => {
  const width = window.innerWidth;
  for (const entity of state.entities.values()) {
    const size = entity.character?.size || 0;
    entity.x = Math.max(0, Math.min(entity.x, width - size));
  }
});

async function loadInitialCharacters() {
  const response = await fetch("/api/characters");
  const characters = await response.json();
  upsertCharacters(characters);
}

socket.on("characters_updated", upsertCharacters);
socket.on("character_state_updated", applyExternalState);

loadInitialCharacters();
requestAnimationFrame(tick);
