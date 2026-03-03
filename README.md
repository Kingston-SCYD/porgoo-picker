# OBS Character Web App (Python)

A small Flask + Socket.IO app that:

1. Shows a web UI where users submit a username and character customization.
2. Stores/submits those characters in real time.
3. Provides an `/overlay` page for OBS Browser Source that draws characters at the bottom of the screen and makes them move back and forth.
4. Checks OBS WebSocket connectivity from Python.

## Requirements

- Python 3.10+
- OBS Studio with **obs-websocket** enabled (OBS 28+ has it built-in)

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Optional OBS environment variables:

```bash
export OBS_HOST=localhost
export OBS_PORT=4455
export OBS_PASSWORD='your_password_if_set'
```

## Run

```bash
python app.py
```

- Control UI: `http://localhost:5000/`
- OBS Overlay URL: `http://localhost:5000/overlay`

## Add to OBS

1. In OBS, add a **Browser Source**.
2. URL: `http://localhost:5000/overlay`
3. Width/Height to match your canvas (e.g., 1920x1080).
4. Keep source visible in your scene.

Characters submitted from the control page appear instantly and animate left↔right along the bottom.
