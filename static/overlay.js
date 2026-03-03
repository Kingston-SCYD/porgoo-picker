const socket = io();
const overlay = document.querySelector("#overlay");

const state = {
  entities: new Map(),
  lastTimestamp: performance.now(),
};

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

      node.appendChild(stack);
      node.appendChild(name);
      overlay.appendChild(node);

      entity = {
        node,
        stack,
        body,
        eyes,
        mouth,
        name,
        x: Math.random() * Math.max(width - char.size, 1),
        dir: Math.random() > 0.5 ? 1 : -1,
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
