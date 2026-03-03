const form = document.querySelector("#character-form");
const statusEl = document.querySelector("#obs-status");

const hueInput = document.querySelector("#hue");
const saturationInput = document.querySelector("#saturation");
const brightnessInput = document.querySelector("#brightness");
const speedInput = document.querySelector("#speed");
const usernameInput = document.querySelector("#username");

const previewBody = document.querySelector("#preview-body");
const previewEyes = document.querySelector("#preview-eyes");
const previewMouth = document.querySelector("#preview-mouth");
const previewName = document.querySelector("#preview-name");
const livePreview = document.querySelector("#live-preview");

const selectedBody = document.querySelector("#selected-body");
const selectedEyes = document.querySelector("#selected-eyes");
const selectedMouth = document.querySelector("#selected-mouth");

const selectorState = {
  body: { assets: [], index: 0 },
  eyes: { assets: [], index: 0 },
  mouth: { assets: [], index: 0 },
};

function lockUsername(username) {
  const value = (username || "").trim();
  if (!value) return;
  usernameInput.value = value;
  usernameInput.disabled = true;
  usernameInput.classList.add("locked-username");
}

function updateValueDisplays() {
  document.querySelector("#hue-value").textContent = hueInput.value;
  document.querySelector("#saturation-value").textContent = saturationInput.value;
  document.querySelector("#brightness-value").textContent = brightnessInput.value;
  document.querySelector("#speed-value").textContent = speedInput.value;
}

function selectedAsset(category) {
  const state = selectorState[category];
  if (!state.assets.length) return "";
  return state.assets[state.index];
}

function selectAssetByName(category, filename) {
  const state = selectorState[category];
  if (!filename || !state.assets.length) return;
  const foundIndex = state.assets.indexOf(filename);
  if (foundIndex >= 0) {
    state.index = foundIndex;
  }
}

function stepCategory(category, direction) {
  const state = selectorState[category];
  if (!state.assets.length) return;
  state.index = (state.index + direction + state.assets.length) % state.assets.length;
  updateLivePreview();
}

function applyCharacterToForm(character) {
  if (!character) return;

  lockUsername(character.username);

  hueInput.value = character.hue ?? 0;
  saturationInput.value = character.saturation ?? 100;
  brightnessInput.value = character.brightness ?? 100;
  speedInput.value = character.speed ?? 1.2;

  selectAssetByName("body", character.body);
  selectAssetByName("eyes", character.eyes);
  selectAssetByName("mouth", character.mouth);

  updateValueDisplays();
  updateLivePreview();
}

function updateLivePreview() {
  const body = selectedAsset("body");
  const eyes = selectedAsset("eyes");
  const mouth = selectedAsset("mouth");

  livePreview.querySelector(".stack").style.width = "75px";
  livePreview.querySelector(".stack").style.height = "75px";

  previewName.textContent = usernameInput.value.trim() || "Preview";

  selectedBody.textContent = body || "None";
  selectedEyes.textContent = eyes || "None";
  selectedMouth.textContent = mouth || "None";

  if (body) {
    previewBody.src = `/asset/body/${encodeURIComponent(body)}`;
    previewBody.style.display = "block";
  } else {
    previewBody.style.display = "none";
  }

  if (eyes) {
    previewEyes.src = `/asset/eyes/${encodeURIComponent(eyes)}`;
    previewEyes.style.display = "block";
  } else {
    previewEyes.style.display = "none";
  }

  if (mouth) {
    previewMouth.src = `/asset/mouth/${encodeURIComponent(mouth)}`;
    previewMouth.style.display = "block";
  } else {
    previewMouth.style.display = "none";
  }

  previewBody.style.filter = `hue-rotate(${hueInput.value}deg) saturate(${saturationInput.value}%) brightness(${brightnessInput.value}%)`;
}

function wireArrows() {
  document.querySelector("#body-prev").addEventListener("click", () => stepCategory("body", -1));
  document.querySelector("#body-next").addEventListener("click", () => stepCategory("body", 1));
  document.querySelector("#eyes-prev").addEventListener("click", () => stepCategory("eyes", -1));
  document.querySelector("#eyes-next").addEventListener("click", () => stepCategory("eyes", 1));
  document.querySelector("#mouth-prev").addEventListener("click", () => stepCategory("mouth", -1));
  document.querySelector("#mouth-next").addEventListener("click", () => stepCategory("mouth", 1));
}

async function loadAssets() {
  const response = await fetch("/api/assets");
  const data = await response.json();
  for (const category of ["body", "eyes", "mouth"]) {
    selectorState[category].assets = data[category] || [];
    selectorState[category].index = 0;
  }
  updateLivePreview();
}

async function loadMyCharacter() {
  try {
    const response = await fetch("/api/my-character");
    if (!response.ok) return;
    const data = await response.json();

    if (data.locked && data.username) {
      lockUsername(data.username);
    }

    if (data.character) {
      applyCharacterToForm(data.character);
    } else {
      updateLivePreview();
    }
  } catch (error) {
    // no-op: this should not block the rest of the page behavior
  }
}

async function loadObsStatus() {
  try {
    const response = await fetch("/api/obs-status");
    const data = await response.json();

    if (data.connected) {
      statusEl.className = "status ok";
      statusEl.textContent = `✅ Connected to OBS ${data.obs_version} (WebSocket ${data.websocket_version})`;
    } else {
      statusEl.className = "status hidden";
      statusEl.textContent = "";
    }
  } catch (error) {
    statusEl.className = "status hidden";
    statusEl.textContent = "";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const body = selectedAsset("body");
  if (!body) {
    alert("No body is available.");
    return;
  }

  const payload = {
    username: usernameInput.value,
    body,
    eyes: selectedAsset("eyes"),
    mouth: selectedAsset("mouth"),
    hue: Number(hueInput.value),
    saturation: Number(saturationInput.value),
    brightness: Number(brightnessInput.value),
    speed: Number(speedInput.value),
  };

  const response = await fetch("/api/character", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    lockUsername(usernameInput.value);
    updateLivePreview();
    alert("Character added/updated in overlay.");
  } else {
    const data = await response.json();
    alert(data.error || "Could not submit character.");
  }
});

for (const input of [hueInput, saturationInput, brightnessInput, speedInput, usernameInput]) {
  input.addEventListener("input", () => {
    updateValueDisplays();
    updateLivePreview();
  });
}

async function init() {
  wireArrows();
  updateValueDisplays();
  updateLivePreview();
  await loadAssets();
  await loadMyCharacter();
  loadObsStatus();
}

init();
