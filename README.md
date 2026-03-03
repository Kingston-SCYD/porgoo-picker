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

- Username (locks per device fingerprint after first successful submit)
- Body / Eyes / Mouth selection via arrows
- Hue, Saturation, Brightness sliders (applied to body layer)
- Speed slider (character size is fixed at 75px)

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

## Username policies

- Each device fingerprint (IP + User-Agent) can only use one username per app run.
- Usernames containing offensive/slur substrings are rejected (customizable via `OFFENSIVE_NAME_SUBSTRINGS`).

- On refresh, the app restores your locked username and latest submitted character design for that fingerprint.


## HTTPS (for Playit forwarding)

You can run the panel over HTTPS in two ways:

By default, the app uses `SOCKETIO_ASYNC_MODE=threading`, which supports `SSL_ADHOC=1`.

- **Provided certificate files**
  - Set `SSL_CERT_FILE` and `SSL_KEY_FILE` to your cert/key paths.
  - Works with `threading` and `eventlet` async modes.
- **Adhoc self-signed certificate**
  - Set `SSL_ADHOC=1` (good for quick testing).
  - Requires `SOCKETIO_ASYNC_MODE=threading`.

Example with cert files:

```bash
SSL_CERT_FILE=/path/to/fullchain.pem \
SSL_KEY_FILE=/path/to/privkey.pem \
python app.py
```

Example with adhoc TLS:

```bash
SSL_ADHOC=1 python app.py
```

When HTTPS is enabled, use `https://...` URLs in your browser source and panel links.

If you force `SOCKETIO_ASYNC_MODE=eventlet`, use `SSL_CERT_FILE` + `SSL_KEY_FILE` instead of `SSL_ADHOC`.

When running in default `threading` mode, the app passes `allow_unsafe_werkzeug=True` for local/self-hosted runs.
