const sizeInput = document.querySelector("#size");
const speedInput = document.querySelector("#speed");
const sizeValue = document.querySelector("#size-value");
const speedValue = document.querySelector("#speed-value");
const form = document.querySelector("#character-form");
const statusEl = document.querySelector("#obs-status");

sizeInput.addEventListener("input", () => (sizeValue.textContent = sizeInput.value));
speedInput.addEventListener("input", () => (speedValue.textContent = speedInput.value));

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

  const payload = {
    username: document.querySelector("#username").value,
    color: document.querySelector("#color").value,
    size: Number(sizeInput.value),
    speed: Number(speedInput.value),
    style: document.querySelector("#style").value,
  };

  const response = await fetch("/api/character", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    form.reset();
    sizeValue.textContent = "56";
    speedValue.textContent = "1.2";
    alert("Character added/updated in overlay.");
  } else {
    const data = await response.json();
    alert(data.error || "Could not submit character.");
  }
});

loadObsStatus();
