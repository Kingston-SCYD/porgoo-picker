from __future__ import annotations

import os
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from threading import Lock
from typing import Dict, List

from flask import Flask, jsonify, render_template, request, send_from_directory
from flask_socketio import SocketIO

try:
    from obsws_python import ReqClient
except Exception:  # dependency might not be installed yet in local env
    ReqClient = None


BASE_DIR = Path(__file__).resolve().parent
ASSET_DIRS = {
    "body": BASE_DIR / "Body",
    "eyes": BASE_DIR / "eyes",
    "mouth": BASE_DIR / "mouth",
}


@dataclass
class Character:
    username: str
    body: str
    eyes: str
    mouth: str
    hue: int
    saturation: int
    brightness: int
    size: int = 75
    speed: float = 1.2


app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret")
socketio = SocketIO(app, cors_allowed_origins="*")

characters: Dict[str, Character] = {}
characters_lock = Lock()

MIN_SUBMIT_INTERVAL_SECONDS = float(os.getenv("MIN_SUBMIT_INTERVAL_SECONDS", "1.5"))

DEFAULT_BLOCKED_SUBSTRINGS = [
    "fuck",
    "shit",
    "bitch",
    "asshole",
    "bastard",
    "cunt",
    "whore",
    "slut",
    "nigger",
    "faggot",
    "kike",
    "spic",
    "chink",
    "retard",
]

blocked_name_substrings = [
    term.strip().lower()
    for term in os.getenv("OFFENSIVE_NAME_SUBSTRINGS", ",".join(DEFAULT_BLOCKED_SUBSTRINGS)).split(",")
    if term.strip()
]

creator_username_registry: Dict[str, str] = {}
creator_last_submit_at: Dict[str, float] = {}
submission_lock = Lock()


def get_creator_key() -> str:
    forwarded_for = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
    ip = forwarded_for or request.remote_addr or "unknown"
    user_agent = request.headers.get("User-Agent", "unknown")
    return f"{ip}|{user_agent}"


LEET_TRANSLATION = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i"})


def normalize_username_for_filter(username: str) -> str:
    lowered = username.lower().translate(LEET_TRANSLATION)
    return "".join(ch for ch in lowered if ch.isalnum())


def has_offensive_username(username: str) -> bool:
    normalized = normalize_username_for_filter(username)
    return any(term in normalized for term in blocked_name_substrings)


def enforce_submission_limits(creator_key: str, username_key: str) -> str | None:
    now = time.time()
    with submission_lock:
        last_submit = creator_last_submit_at.get(creator_key)
        if last_submit is not None and now - last_submit < MIN_SUBMIT_INTERVAL_SECONDS:
            return "You are submitting too quickly. Please wait a moment and try again."

        registered_username = creator_username_registry.get(creator_key)
        if registered_username is None:
            creator_username_registry[creator_key] = username_key
        elif registered_username != username_key:
            return "Only one username is allowed per device fingerprint while this app is running."

        creator_last_submit_at[creator_key] = now
    return None



OBS_CONFIG = {
    "host": os.getenv("OBS_HOST", "localhost"),
    "port": int(os.getenv("OBS_PORT", "4455")),
    "password": os.getenv("OBS_PASSWORD", ""),
    "timeout": float(os.getenv("OBS_TIMEOUT", "3")),
}


def list_pngs(category: str) -> List[str]:
    directory = ASSET_DIRS[category]
    if not directory.exists():
        return []
    return sorted([file.name for file in directory.glob("*.png") if file.is_file()])


def get_obs_status() -> dict:
    if ReqClient is None:
        return {"connected": False, "error": "obsws-python not installed"}

    try:
        client = ReqClient(**OBS_CONFIG)
        version = client.get_version()
        return {
            "connected": True,
            "obs_version": version.obs_version,
            "websocket_version": version.obs_web_socket_version,
        }
    except Exception as exc:  # pragma: no cover - runtime integration check
        return {"connected": False, "error": str(exc)}


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/overlay")
def overlay():
    return render_template("overlay.html")


@app.get("/api/obs-status")
def obs_status():
    return jsonify(get_obs_status())


@app.get("/api/assets")
def get_assets():
    return jsonify({
        "body": list_pngs("body"),
        "eyes": list_pngs("eyes"),
        "mouth": list_pngs("mouth"),
    })


@app.get("/asset/<category>/<path:filename>")
def get_asset(category: str, filename: str):
    if category not in ASSET_DIRS:
        return jsonify({"error": "invalid category"}), 404
    if Path(filename).name != filename:
        return jsonify({"error": "invalid filename"}), 400
    if not filename.lower().endswith(".png"):
        return jsonify({"error": "assets must be png"}), 400
    if filename not in list_pngs(category):
        return jsonify({"error": "asset not found"}), 404
    return send_from_directory(ASSET_DIRS[category], filename)


@app.post("/api/character")
def add_or_update_character():
    payload = request.get_json(silent=True) or {}

    username = (payload.get("username") or "").strip()
    body = (payload.get("body") or "").strip()
    eyes = (payload.get("eyes") or "").strip()
    mouth = (payload.get("mouth") or "").strip()

    try:
        hue = int(payload.get("hue", 0))
        saturation = int(payload.get("saturation", 100))
        brightness = int(payload.get("brightness", 100))
        size = 75
        speed = float(payload.get("speed", 1.2))
    except (TypeError, ValueError):
        return jsonify({"error": "numeric fields contain invalid values"}), 400

    if not username:
        return jsonify({"error": "username is required"}), 400
    if has_offensive_username(username):
        return jsonify({"error": "username contains blocked language"}), 400

    username_key = username.lower()
    if not body:
        return jsonify({"error": "body png is required"}), 400
    if body not in list_pngs("body"):
        return jsonify({"error": "invalid body asset"}), 400
    if eyes and eyes not in list_pngs("eyes"):
        return jsonify({"error": "invalid eyes asset"}), 400
    if mouth and mouth not in list_pngs("mouth"):
        return jsonify({"error": "invalid mouth asset"}), 400
    if not (-180 <= hue <= 180):
        return jsonify({"error": "hue must be between -180 and 180"}), 400
    if not (0 <= saturation <= 200):
        return jsonify({"error": "saturation must be between 0 and 200"}), 400
    if not (20 <= brightness <= 200):
        return jsonify({"error": "brightness must be between 20 and 200"}), 400
    if not (0.2 <= speed <= 3.0):
        return jsonify({"error": "speed must be between 0.2 and 3.0"}), 400

    creator_key = get_creator_key()
    limit_error = enforce_submission_limits(creator_key, username_key)
    if limit_error:
        return jsonify({"error": limit_error}), 429

    character = Character(
        username=username,
        body=body,
        eyes=eyes,
        mouth=mouth,
        hue=hue,
        saturation=saturation,
        brightness=brightness,
        size=size,
        speed=speed,
    )

    with characters_lock:
        characters[username_key] = character
        serialized = [asdict(char) for char in characters.values()]

    socketio.emit("characters_updated", serialized)
    return jsonify({"message": "character upserted", "character": asdict(character)})


@app.get("/api/characters")
def get_characters():
    with characters_lock:
        serialized = [asdict(char) for char in characters.values()]
    return jsonify(serialized)


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "5000")))
