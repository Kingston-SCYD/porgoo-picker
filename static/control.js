const form = document.querySelector("#character-form");
const statusEl = document.querySelector("#obs-status");

const hueInput = document.querySelector("#hue");
const saturationInput = document.querySelector("#saturation");
const brightnessInput = document.querySelector("#brightness");
const sizeInput = document.querySelector("#size");
const speedInput = document.querySelector("#speed");

const selectorState = {
  body: { assets: [], index: 0 },
  eyes: { assets: [], index: 0 },
  mouth: { assets: [], index: 0 },
};

function updateValueDisplays() {
  document.querySelector("#hue-value").textContent = hueInput.value;
  document.querySelector("#saturation-value").textContent = saturationInput.value;
  document.querySelector("#brightness-value").textContent = brightnessInput.value;
  document.querySelector("#size-value").textContent = sizeInput.value;
  document.querySelector("#speed-value").textContent = speedInput.value;
}

function selectedAsset(category) {
  const state = selectorState[category];
  if (!state.assets.length) return "";
  return state.assets[state.index];
}

function renderSelector(category) {
  const state = selectorState[category];
  const root = document.querySelector(`.selector[data-category='${category}']`);
  const label = root.querySelector(".label");
  const preview = root.querySelector(".preview");

  const file = selectedAsset(category);
  if (!file) {
    label.textContent = "No PNGs found";
    preview.removeAttribute("src");
    preview.style.visibility = "hidden";
    return;
  }

  label.textContent = file;
  preview.style.visibility = "visible";
  preview.src = `/asset/${category}/${encodeURIComponent(file)}`;
}

function wireSelectorArrows() {
  for (const selector of document.querySelectorAll(".selector")) {
    const category = selector.dataset.category;
    const prev = selector.querySelector(".prev");
    const next = selector.querySelector(".next");

    prev.addEventListener("click", () => {
      const state = selectorState[category];
      if (!state.assets.length) return;
      state.index = (state.index - 1 + state.assets.length) % state.assets.length;
      renderSelector(category);
    });

    next.addEventListener("click", () => {
      const state = selectorState[category];
      if (!state.assets.length) return;
      state.index = (state.index + 1) % state.assets.length;
      renderSelector(category);
    });
  }
}

async function loadAssets() {
  const response = await fetch("/api/assets");
  const data = await response.json();
  for (const category of ["body", "eyes", "mouth"]) {
    selectorState[category].assets = data[category] || [];
    selectorState[category].index = 0;
    renderSelector(category);
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
    alert("Add at least one 256x256 body PNG to ./Body before submitting.");
    return;
  }

  const payload = {
    username: document.querySelector("#username").value,
    body,
    eyes: selectedAsset("eyes"),
    mouth: selectedAsset("mouth"),
    hue: Number(hueInput.value),
    saturation: Number(saturationInput.value),
    brightness: Number(brightnessInput.value),
    size: Number(sizeInput.value),
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

for (const input of [hueInput, saturationInput, brightnessInput, sizeInput, speedInput]) {
  input.addEventListener("input", updateValueDisplays);
}

wireSelectorArrows();
updateValueDisplays();
loadObsStatus();
loadAssets();
