const socket = io();
const overlay = document.querySelector("#overlay");

const WORLD_WIDTH = 1920;
const WORLD_HEIGHT = 1080;

const state = {
  entities: new Map(),
};

function createEntity(char) {
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

  return { node, facing, stack, body, eyes, mouth, name, x: 0, y: 0, vx: 0, vy: 0, dir: 1 };
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
}

function applyWorldState(entries) {
  if (!Array.isArray(entries)) return;
  for (const update of entries) {
    const key = (update.username || "").toLowerCase();
    const entity = state.entities.get(key);
    if (!entity || !entity.character) continue;

    entity.x = Number(update.x) || 0;
    entity.y = Number(update.y) || 0;
    entity.vx = Number(update.vx) || 0;
    entity.vy = Number(update.vy) || 0;
    entity.dir = Number(update.dir) >= 0 ? 1 : -1;
  }

  render();
}

function render() {
  const scaleX = window.innerWidth / WORLD_WIDTH;
  const scaleY = window.innerHeight / WORLD_HEIGHT;

  for (const entity of state.entities.values()) {
    const rising = Math.max(-entity.vy / 240, 0);
    const falling = Math.max(entity.vy / 260, 0);
    const squishX = Math.max(0.9, Math.min(1.1, 1 + rising * 0.03 - falling * 0.05));
    const squishY = Math.max(0.9, Math.min(1.1, 1 - rising * 0.05 + falling * 0.07));

    const px = entity.x * scaleX;
    const py = entity.y * scaleY;

    entity.node.style.transform = `translate(${px}px, ${py}px)`;
    entity.facing.style.transform = `scaleX(${entity.dir === 1 ? -1 : 1})`;
    entity.stack.style.transform = `scale(${squishX}, ${squishY})`;
  }
}

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
