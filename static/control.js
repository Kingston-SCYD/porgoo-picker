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

function stepCategory(category, direction) {
  const state = selectorState[category];
  if (!state.assets.length) return;
  state.index = (state.index + direction + state.assets.length) % state.assets.length;
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

async function loadObsStatus() {
  try {
    const response = await fetch("/api/obs-status");
    const data = await response.json();

    if (data.connected) {
      statusEl.className = "status ok";
      statusEl.textContent = `✅ Connected to OBS ${data.obs_version} (WebSocket ${data.websocket_version})`;
    } else {
      statusEl.className = "status err";
      statusEl.textContent = `⚠️ OBS not connected: ${data.error}`;
    }
  } catch (error) {
    statusEl.className = "status err";
    statusEl.textContent = `⚠️ Could not check OBS status: ${error}`;
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

wireArrows();
updateValueDisplays();
updateLivePreview();
loadObsStatus();
loadAssets();
