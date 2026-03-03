const socket = io();
const overlay = document.querySelector("#overlay");

const state = {
  entities: new Map(),
  lastTimestamp: performance.now(),
};

function randomJumpDelay() {
  return 0.9 + Math.random() * 0.8;
}

function upsertCharacters(characters) {
  const nextKeys = new Set(characters.map((char) => char.username.toLowerCase()));

  for (const [key, value] of state.entities.entries()) {
    if (!nextKeys.has(key)) {
      value.node.remove();
      state.entities.delete(key);
    }
  }

  const width = window.innerWidth;

  for (const char of characters) {
    const key = char.username.toLowerCase();
    let entity = state.entities.get(key);

    if (!entity) {
      const node = document.createElement("div");
      node.className = "character";

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

      entity = {
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
        dir: Math.random() > 0.5 ? 1 : -1,
        nextJumpIn: randomJumpDelay(),
      };

      state.entities.set(key, entity);
    }

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
}

async function loadInitialCharacters() {
  const response = await fetch("/api/characters");
  const characters = await response.json();
  upsertCharacters(characters);
}

socket.on("characters_updated", upsertCharacters);

function tick(now) {
  const dt = Math.min((now - state.lastTimestamp) / 1000, 0.05);
  state.lastTimestamp = now;

  const width = window.innerWidth;

  for (const entity of state.entities.values()) {
    const { character } = entity;
    if (!character) continue;

    const horizontalPxPerSecond = character.speed * 90;
    entity.x += entity.dir * horizontalPxPerSecond * dt;

    const maxX = Math.max(width - character.size, 0);
    if (entity.x <= 0) {
      entity.x = 0;
      entity.dir = 1;
    } else if (entity.x >= maxX) {
      entity.x = maxX;
      entity.dir = -1;
    }

    entity.nextJumpIn -= dt;
    if (entity.y === 0 && entity.nextJumpIn <= 0) {
      entity.vy = -(155 + Math.random() * 55);
      entity.nextJumpIn = randomJumpDelay();
    }

    entity.vy += 540 * dt;
    entity.y += entity.vy * dt;

    if (entity.y > 0) {
      entity.y = 0;
      entity.vy = 0;
    }

    const rising = Math.max(-entity.vy / 240, 0);
    const falling = Math.max(entity.vy / 260, 0);
    const squishX = Math.max(0.9, Math.min(1.1, 1 + rising * 0.03 - falling * 0.05));
    const squishY = Math.max(0.9, Math.min(1.1, 1 - rising * 0.05 + falling * 0.07));

    entity.node.style.transform = `translate(${entity.x}px, ${entity.y}px)`;
    entity.facing.style.transform = `scaleX(${entity.dir === 1 ? 1 : -1})`;
    entity.stack.style.transform = `scale(${squishX}, ${squishY})`;
  }

  requestAnimationFrame(tick);
}

window.addEventListener("resize", () => {
  const width = window.innerWidth;
  for (const entity of state.entities.values()) {
    const size = entity.character?.size || 0;
    entity.x = Math.max(0, Math.min(entity.x, width - size));
  }
});

loadInitialCharacters();
requestAnimationFrame(tick);
