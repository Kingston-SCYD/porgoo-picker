from __future__ import annotations

import os
from dataclasses import dataclass, asdict
from threading import Lock
from typing import Dict

from flask import Flask, jsonify, render_template, request
from flask_socketio import SocketIO

try:
    from obsws_python import ReqClient
except Exception:  # dependency might not be installed yet in local env
    ReqClient = None


@dataclass
class Character:
    username: str
    color: str
    size: int
    speed: float
    style: str


app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret")
socketio = SocketIO(app, cors_allowed_origins="*")

characters: Dict[str, Character] = {}
characters_lock = Lock()


OBS_CONFIG = {
    "host": os.getenv("OBS_HOST", "localhost"),
    "port": int(os.getenv("OBS_PORT", "4455")),
    "password": os.getenv("OBS_PASSWORD", ""),
    "timeout": float(os.getenv("OBS_TIMEOUT", "3")),
}


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


@app.post("/api/character")
def add_or_update_character():
    payload = request.get_json(silent=True) or {}

    username = (payload.get("username") or "").strip()
    color = (payload.get("color") or "#66ccff").strip()
    style = (payload.get("style") or "blob").strip().lower()

    try:
        size = int(payload.get("size", 56))
        speed = float(payload.get("speed", 1.2))
    except (TypeError, ValueError):
        return jsonify({"error": "size must be int and speed must be numeric"}), 400

    if not username:
        return jsonify({"error": "username is required"}), 400
    if size < 24 or size > 120:
        return jsonify({"error": "size must be between 24 and 120"}), 400
    if speed < 0.2 or speed > 3.0:
        return jsonify({"error": "speed must be between 0.2 and 3.0"}), 400
    if style not in {"blob", "square", "cat"}:
        return jsonify({"error": "style must be blob, square, or cat"}), 400

    character = Character(
        username=username,
        color=color,
        size=size,
        speed=speed,
        style=style,
    )

    with characters_lock:
        characters[username.lower()] = character
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
