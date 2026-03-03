# OBS Character Web App (Python)

Flask + Socket.IO app where users customize a layered PNG character from a web UI and submit by username.
The character appears in an OBS Browser Source overlay at the bottom of the screen and moves left/right.

## Character assets

Put 256x256 transparent PNG files in the app directory:

- `Body/` (required; base body PNG, typically bright red so H/S/B tinting is obvious)
- `eyes/` (optional overlay layer)
- `mouth/` (optional overlay layer)

The UI provides left/right arrow selectors with a center preview box for each layer.

## Controls

- Username
- Body / Eyes / Mouth selection via arrows
- Hue, Saturation, Brightness sliders (applied to body layer)
- Size and speed sliders

## Requirements

- Python 3.10+
- OBS Studio with obs-websocket enabled (OBS 28+)

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
python app.py
```

- Control UI: `http://localhost:5000/`
- Overlay URL: `http://localhost:5000/overlay`

Add the overlay URL as an OBS Browser Source in your scene.
