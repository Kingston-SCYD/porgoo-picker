const socket = io();
const overlay = document.querySelector("#overlay");

const WORLD_WIDTH = 1920;
const WORLD_HEIGHT = 1080;

const state = {
  entities: new Map(),
  grabbedKey: null,
  pointer: { x: 0, y: 0, lastX: 0, lastY: 0, lastT: performance.now() },
  activePointerId: null,
};

function createEntity(char) {
  const node = document.createElement("div");
  node.className = "character draggable";

  const facing = document.createElement("div");
  facing.className = "facing";

  const stack = document.createElement("div");
  stack.className = "stack";

  const body = document.createElement("img");
  body.className = "layer body";
  body.draggable = false;
  stack.appendChild(body);

  const eyes = document.createElement("img");
  eyes.className = "layer eyes";
  eyes.draggable = false;
  stack.appendChild(eyes);

  const mouth = document.createElement("img");
  mouth.className = "layer mouth";
  mouth.draggable = false;
  stack.appendChild(mouth);

  const name = document.createElement("div");
  name.className = "name";

  facing.appendChild(stack);
  node.appendChild(facing);
  node.appendChild(name);
  overlay.appendChild(node);

  const key = char.username.toLowerCase();
  node.dataset.key = key;

  return { key, node, facing, stack, body, eyes, mouth, name, x: 0, y: 0, vx: 0, vy: 0, dir: 1, grabbed: false };
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

  for (const char of characters) {
    const key = char.username.toLowerCase();
    let entity = state.entities.get(key);

    if (!entity) {
      entity = createEntity(char);
      state.entities.set(key, entity);
    }

    applyCharacterVisuals(entity, char);
  }

  render();
}

function applyWorldState(entries) {
  if (!Array.isArray(entries)) return;
  for (const update of entries) {
    const key = (update.username || "").toLowerCase();
    const entity = state.entities.get(key);
    if (!entity || entity.grabbed || !entity.character) continue;

    entity.x = Number(update.x) || 0;
    entity.y = Number(update.y) || 0;
    entity.vx = Number(update.vx) || 0;
    entity.vy = Number(update.vy) || 0;
    entity.dir = Number(update.dir) >= 0 ? 1 : -1;
  }

  render();
}

function screenToWorld(clientX, clientY, size) {
  const worldX = (clientX / window.innerWidth) * WORLD_WIDTH - size / 2;
  const worldFromBottom = ((window.innerHeight - clientY) / window.innerHeight) * WORLD_HEIGHT;
  const worldY = -(Math.max(0, worldFromBottom - size / 2));
  return { x: worldX, y: worldY };
}

function emitState(entity, grabbed) {
  socket.emit("admin_update_character_state", {
    username: entity.character.username,
    x: entity.x,
    y: entity.y,
    vx: entity.vx,
    vy: entity.vy,
    dir: entity.dir,
    grabbed,
  });
}

function onPointerMove(event) {
  if (state.activePointerId !== null && event.pointerId !== state.activePointerId) return;
  const now = performance.now();
  const dt = Math.max((now - state.pointer.lastT) / 1000, 0.001);
  state.pointer.lastX = state.pointer.x;
  state.pointer.lastY = state.pointer.y;
  state.pointer.lastT = now;
  state.pointer.x = event.clientX;
  state.pointer.y = event.clientY;

  if (!state.grabbedKey) return;
  const entity = state.entities.get(state.grabbedKey);
  if (!entity || !entity.character) return;

  const world = screenToWorld(state.pointer.x, state.pointer.y, entity.character.size);
  entity.x = Math.max(0, Math.min(world.x, WORLD_WIDTH - entity.character.size));
  entity.y = Math.max(-(WORLD_HEIGHT - entity.character.size), Math.min(world.y, 0));

  const prevWorld = screenToWorld(state.pointer.lastX, state.pointer.lastY, entity.character.size);
  entity.vx = (entity.x - prevWorld.x) / dt;
  entity.vy = (entity.y - prevWorld.y) / dt;
  entity.dir = entity.vx >= 0 ? 1 : -1;

  emitState(entity, true);
  render();
}

function releaseGrab(event) {
  if (event && state.activePointerId !== null && event.pointerId !== state.activePointerId) return;
  if (!state.grabbedKey) return;
  const entity = state.entities.get(state.grabbedKey);
  state.grabbedKey = null;
  overlay.classList.remove("dragging");
  if (state.activePointerId !== null && overlay.hasPointerCapture(state.activePointerId)) {
    overlay.releasePointerCapture(state.activePointerId);
  }
  state.activePointerId = null;
  if (!entity) return;
  entity.grabbed = false;

  entity.vx = Math.max(-900, Math.min(900, entity.vx));
  entity.vy = Math.max(-900, Math.min(900, entity.vy));
  emitState(entity, false);
}

function onPointerDown(event) {
  event.preventDefault();
  const node = event.target.closest(".character");
  if (!node) return;

  const key = node.dataset.key;
  const entity = state.entities.get(key);
  if (!entity || !entity.character) return;

  if (event.button === 2) {
    event.preventDefault();
    socket.emit("admin_remove_character", { username: entity.character.username });
    return;
  }

  if (event.button !== 0) return;

  state.grabbedKey = key;
  state.activePointerId = event.pointerId;
  overlay.setPointerCapture(event.pointerId);
  entity.grabbed = true;
  entity.vx = 0;
  entity.vy = 0;
  overlay.classList.add("dragging");
  state.pointer.lastX = event.clientX;
  state.pointer.lastY = event.clientY;
  state.pointer.lastT = performance.now();
  onPointerMove(event);
}

function render() {
  const scaleX = window.innerWidth / WORLD_WIDTH;
  const scaleY = window.innerHeight / WORLD_HEIGHT;

  for (const entity of state.entities.values()) {
    const rising = Math.max(-entity.vy / 240, 0);
    const falling = Math.max(entity.vy / 260, 0);
    const squishX = Math.max(0.9, Math.min(1.1, 1 + rising * 0.03 - falling * 0.05));
    const squishY = Math.max(0.9, Math.min(1.1, 1 - rising * 0.05 + falling * 0.07));

    entity.node.style.transform = `translate(${entity.x * scaleX}px, ${entity.y * scaleY}px)`;
    entity.facing.style.transform = `scaleX(${entity.dir === 1 ? -1 : 1})`;
    entity.stack.style.transform = `scale(${squishX}, ${squishY})`;
  }
}

overlay.addEventListener("pointermove", onPointerMove);
overlay.addEventListener("pointerup", releaseGrab);
overlay.addEventListener("pointercancel", releaseGrab);
overlay.addEventListener("pointerdown", onPointerDown);
overlay.addEventListener("dragstart", (event) => event.preventDefault());
overlay.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("resize", render);

async function loadInitialCharacters() {
  const response = await fetch("/api/characters");
  const characters = await response.json();
  upsertCharacters(characters);

  const worldResponse = await fetch("/api/world-state");
  const worldState = await worldResponse.json();
  applyWorldState(worldState);
}

socket.on("characters_updated", upsertCharacters);
socket.on("world_state", applyWorldState);

loadInitialCharacters();
