const socket = io();
const overlay = document.querySelector("#overlay");

const state = {
  entities: new Map(),
  lastTimestamp: performance.now(),
};

function upsertCharacters(characters) {
  const nextKeys = new Set(characters.map((char) => char.username.toLowerCase()));

  // Remove old
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

      const avatar = document.createElement("div");
      avatar.className = `avatar ${char.style}`;
      node.appendChild(avatar);

      const name = document.createElement("div");
      name.className = "name";
      node.appendChild(name);

      overlay.appendChild(node);

      entity = {
        node,
        avatar,
        name,
        x: Math.random() * Math.max(width - char.size, 1),
        dir: Math.random() > 0.5 ? 1 : -1,
      };

      state.entities.set(key, entity);
    }

    entity.character = char;
    entity.avatar.style.background = char.color;
    entity.avatar.style.width = `${char.size}px`;
    entity.avatar.style.height = `${char.size}px`;
    entity.avatar.className = `avatar ${char.style}`;
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
  const dt = Math.min((now - state.lastTimestamp) / 16.667, 3);
  state.lastTimestamp = now;

  const width = window.innerWidth;

  for (const entity of state.entities.values()) {
    const { character } = entity;
    if (!character) continue;

    const pxPerFrame = character.speed * 1.6;
    entity.x += entity.dir * pxPerFrame * dt;

    const maxX = Math.max(width - character.size, 0);
    if (entity.x <= 0) {
      entity.x = 0;
      entity.dir = 1;
    } else if (entity.x >= maxX) {
      entity.x = maxX;
      entity.dir = -1;
    }

    entity.node.style.transform = `translateX(${entity.x}px)`;
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
