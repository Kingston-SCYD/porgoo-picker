from __future__ import annotations

import math
import os
import random
import re
import secrets
import threading
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List

from flask import Flask, g, jsonify, render_template, request, send_from_directory
from flask_socketio import SocketIO
from werkzeug.middleware.proxy_fix import ProxyFix

try:
    from obsws_python import ReqClient
except Exception:  # pragma: no cover - optional dependency at runtime
    ReqClient = None


@dataclass
class Character:
    username: str
    body: str
    eyes: str
    mouth: str
    hue: int
    saturation: int
    brightness: int
    size: int
    speed: float


BASE_DIR = Path(__file__).resolve().parent
ASSET_DIRS = {
    "body": BASE_DIR / "Body",
    "eyes": BASE_DIR / "eyes",
    "mouth": BASE_DIR / "mouth",
}

app = Flask(__name__)
if os.getenv("TRUST_PROXY_HEADERS", "1").strip().lower() in {"1", "true", "yes", "on"}:
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode=os.getenv("SOCKETIO_ASYNC_MODE", "threading").strip() or "threading",
)

characters: Dict[str, Character] = {}
characters_lock = threading.Lock()

creator_username_registry: Dict[str, str] = {}
creator_last_submit_at: Dict[str, float] = {}
submission_lock = threading.Lock()

WORLD_WIDTH = 1920
WORLD_HEIGHT = 1080
GRAVITY = 540.0
BOUNCE_DAMPING = 0.72
CEILING_BOUNCE_DAMPING = 0.62
GROUND_SLIDE_MULTIPLIER = 0.45
GROUND_DRAG_BASE = 0.12
MIN_SUBMIT_INTERVAL_SECONDS = float(os.getenv("MIN_SUBMIT_INTERVAL_SECONDS", "0.8"))

character_states: Dict[str, dict] = {}
state_lock = threading.Lock()
physics_thread_started = False

OFFENSIVE_NAME_SUBSTRINGS_DEFAULT = [
    "nigger", "nigga", "faggot", "fag", "kike", "chink", "spic", "wetback",
    "retard", "tranny", "cunt", "whore", "slut", "hitler", "naz", "rape",
]
blocked_name_substrings = [
    term.strip().lower() for term in os.getenv("OFFENSIVE_NAME_SUBSTRINGS", ",".join(OFFENSIVE_NAME_SUBSTRINGS_DEFAULT)).split(",") if term.strip()
]

LEET_TRANSLATION = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i"})



CREATOR_ID_COOKIE = "porgu_creator_id"
CREATOR_ID_RE = re.compile(r"^[a-f0-9]{32}$")


def get_or_assign_creator_id() -> str:
    creator_id = (request.cookies.get(CREATOR_ID_COOKIE) or "").strip().lower()
    if CREATOR_ID_RE.fullmatch(creator_id):
        g.creator_id_to_set = None
        return creator_id

    creator_id = secrets.token_hex(16)
    g.creator_id_to_set = creator_id
    return creator_id


def attach_creator_cookie(response):
    creator_id_to_set = getattr(g, "creator_id_to_set", None)
    if creator_id_to_set:
        response.set_cookie(
            CREATOR_ID_COOKIE,
            creator_id_to_set,
            max_age=60 * 60 * 24 * 365,
            httponly=True,
            samesite="Lax",
            secure=request.is_secure,
        )
    return response


OBS_CONFIG = {
    "host": os.getenv("OBS_HOST", "localhost"),
    "port": int(os.getenv("OBS_PORT", "4455")),
    "password": os.getenv("OBS_PASSWORD", ""),
    "timeout": float(os.getenv("OBS_TIMEOUT", "3")),
}


def get_creator_key() -> str:
    return get_or_assign_creator_id()


def normalize_username_key(username: str) -> str:
    return username.strip().lower()


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
        return {"connected": True, "obs_version": version.obs_version, "websocket_version": version.obs_web_socket_version}
    except Exception as exc:  # pragma: no cover
        return {"connected": False, "error": str(exc)}


def get_ssl_context() -> str | tuple[str, str] | None:
    cert_file = os.getenv("SSL_CERT_FILE", "").strip()
    key_file = os.getenv("SSL_KEY_FILE", "").strip()
    use_adhoc = os.getenv("SSL_ADHOC", "0").strip().lower() in {"1", "true", "yes", "on"}
    if cert_file and key_file:
        return (cert_file, key_file)
    if use_adhoc:
        return "adhoc"
    return None


def build_socketio_run_kwargs(port: int) -> dict:
    ssl_context = get_ssl_context()
    run_kwargs = {"host": "0.0.0.0", "port": port}
    if socketio.async_mode == "threading":
        run_kwargs["allow_unsafe_werkzeug"] = True
    if isinstance(ssl_context, tuple):
        cert_file, key_file = ssl_context
        run_kwargs["certfile"] = cert_file
        run_kwargs["keyfile"] = key_file
    elif ssl_context == "adhoc":
        if socketio.async_mode == "threading":
            run_kwargs["ssl_context"] = "adhoc"
        else:
            raise RuntimeError("SSL_ADHOC requires SOCKETIO_ASYNC_MODE=threading. Use SSL_CERT_FILE/SSL_KEY_FILE for eventlet/gevent.")
    return run_kwargs


def random_jump_delay() -> float:
    return 0.9 + random.random() * 0.8


def create_state_for_character(username_key: str, character: Character) -> dict:
    max_x = max(WORLD_WIDTH - character.size, 0)
    return {
        "username": character.username,
        "x": random.random() * max_x,
        "y": 0.0,
        "vx": 0.0,
        "vy": 0.0,
        "dir": 1 if random.random() > 0.5 else -1,
        "next_jump_in": random_jump_delay(),
        "grabbed": False,
    }


def ensure_character_states_locked() -> None:
    for username_key, character in characters.items():
        if username_key not in character_states:
            character_states[username_key] = create_state_for_character(username_key, character)
        else:
            character_states[username_key]["username"] = character.username

    stale = [key for key in character_states if key not in characters]
    for key in stale:
        character_states.pop(key, None)


def serialize_world_state() -> list[dict]:
    with characters_lock, state_lock:
        ensure_character_states_locked()
        snapshot = []
        for username_key, state in character_states.items():
            character = characters.get(username_key)
            if not character:
                continue
            snapshot.append({
                "username": character.username,
                "size": character.size,
                "x": state["x"],
                "y": state["y"],
                "vx": state["vx"],
                "vy": state["vy"],
                "dir": state["dir"],
            })
    return snapshot


def emit_world_state() -> None:
    socketio.emit("world_state", serialize_world_state())


def physics_loop() -> None:
    last = time.perf_counter()
    emit_accum = 0.0
    while True:
        now = time.perf_counter()
        dt = min(now - last, 0.05)
        last = now
        with characters_lock, state_lock:
            ensure_character_states_locked()
            for key, character in characters.items():
                state = character_states[key]
                size = character.size
                max_x = max(WORLD_WIDTH - size, 0)
                ceiling_y = -(WORLD_HEIGHT - size)
                if state["grabbed"]:
                    continue

                state["next_jump_in"] -= dt
                if state["y"] == 0 and state["next_jump_in"] <= 0:
                    if state["x"] <= 0:
                        state["dir"] = 1
                    elif state["x"] >= max_x:
                        state["dir"] = -1
                    hop_speed = character.speed * 105
                    state["vx"] = state["dir"] * hop_speed
                    state["vy"] = -(155 + random.random() * 55)
                    state["next_jump_in"] = random_jump_delay()

                if state["y"] < 0 or state["vy"] < 0 or abs(state["vx"]) > 1:
                    state["x"] += state["vx"] * dt

                if state["x"] <= 0:
                    state["x"] = 0
                    state["dir"] = 1
                    state["vx"] = abs(state["vx"]) * BOUNCE_DAMPING
                elif state["x"] >= max_x:
                    state["x"] = max_x
                    state["dir"] = -1
                    state["vx"] = -abs(state["vx"]) * BOUNCE_DAMPING

                state["vy"] += GRAVITY * dt
                state["y"] += state["vy"] * dt

                if state["y"] < ceiling_y:
                    state["y"] = ceiling_y
                    state["vy"] = abs(state["vy"]) * CEILING_BOUNCE_DAMPING

                if state["y"] > 0:
                    state["y"] = 0
                    state["vy"] = 0
                    state["vx"] *= GROUND_SLIDE_MULTIPLIER

                if state["y"] == 0:
                    state["vx"] *= math.pow(GROUND_DRAG_BASE, dt)
                    if abs(state["vx"]) < 2.5:
                        state["vx"] = 0

        emit_accum += dt
        if emit_accum >= 1 / 30:
            emit_world_state()
            emit_accum = 0.0
        socketio.sleep(1 / 120)


def ensure_physics_thread_started() -> None:
    global physics_thread_started
    if physics_thread_started:
        return
    physics_thread_started = True
    socketio.start_background_task(physics_loop)


USERNAME_ALLOWED_RE = re.compile(r"^[A-Za-z0-9 _.-]{2,20}$")


@app.before_request
def _start_physics_once() -> None:
    ensure_physics_thread_started()
    get_or_assign_creator_id()


@app.after_request
def _attach_creator_cookie(response):
    return attach_creator_cookie(response)


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/overlay")
def overlay():
    return render_template("overlay.html")


@app.get("/admin")
def admin_overlay():
    return render_template("admin.html")


@app.get("/api/obs-status")
def obs_status():
    return jsonify(get_obs_status())


@app.get("/api/links")
def get_links():
    base = request.host_url.rstrip("/")
    return jsonify({"panel_url": f"{base}/", "overlay_url": f"{base}/overlay", "admin_url": f"{base}/admin"})


@app.get("/api/assets")
def get_assets():
    return jsonify({"body": list_pngs("body"), "eyes": list_pngs("eyes"), "mouth": list_pngs("mouth")})


@app.get("/api/my-character")
def get_my_character():
    creator_key = get_creator_key()
    username_key = creator_username_registry.get(creator_key)
    if not username_key:
        return jsonify({"locked": False, "username": "", "character": None})

    with characters_lock:
        character = characters.get(username_key)

    if character is None:
        return jsonify({"locked": True, "username": username_key, "character": None})

    return jsonify({"locked": True, "username": character.username, "character": asdict(character)})


@app.get("/api/characters")
def get_characters():
    with characters_lock:
        serialized = [asdict(char) for char in characters.values()]
    return jsonify(serialized)


@app.get("/api/world-state")
def get_world_state():
    return jsonify(serialize_world_state())


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
    if not USERNAME_ALLOWED_RE.fullmatch(username):
        return jsonify({"error": "username can only use letters, numbers, spaces, dots, dashes, and underscores"}), 400
    if has_offensive_username(username):
        return jsonify({"error": "username contains blocked language"}), 400

    username_key = normalize_username_key(username)
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

    character = Character(username=username, body=body, eyes=eyes, mouth=mouth, hue=hue, saturation=saturation, brightness=brightness, size=size, speed=speed)

    with characters_lock, state_lock:
        existing_state = character_states.get(username_key)
        characters[username_key] = character
        if existing_state is None:
            character_states[username_key] = create_state_for_character(username_key, character)
        else:
            existing_state["username"] = character.username

        serialized = [asdict(char) for char in characters.values()]

    socketio.emit("characters_updated", serialized)
    emit_world_state()
    return jsonify({"message": "character upserted", "character": asdict(character)})


@socketio.on("connect")
def on_connect():
    ensure_physics_thread_started()
    emit_world_state()


@socketio.on("admin_update_character_state")
def admin_update_character_state(payload):
    if not isinstance(payload, dict):
        return

    username = str(payload.get("username", "")).strip()
    if not username:
        return
    username_key = username.lower()

    with characters_lock, state_lock:
        character = characters.get(username_key)
        entity = character_states.get(username_key)
        if not character or not entity:
            return

        size = character.size
        max_x = max(WORLD_WIDTH - size, 0)
        ceiling_y = -(WORLD_HEIGHT - size)

        def num(name: str, default: float = 0.0) -> float:
            value = payload.get(name, default)
            if not isinstance(value, (int, float)) or not math.isfinite(value):
                return default
            return float(value)

        entity["x"] = max(0.0, min(num("x", entity["x"]), max_x))
        entity["y"] = max(ceiling_y, min(num("y", entity["y"]), 0.0))
        entity["vx"] = max(-1400.0, min(num("vx", entity["vx"]), 1400.0))
        entity["vy"] = max(-1400.0, min(num("vy", entity["vy"]), 1400.0))
        entity["dir"] = 1 if num("dir", entity["dir"]) >= 0 else -1

        if payload.get("grabbed") is True:
            entity["grabbed"] = True
            entity["vx"] = 0.0
            entity["vy"] = 0.0
        elif payload.get("grabbed") is False:
            entity["grabbed"] = False
            entity["next_jump_in"] = max(entity.get("next_jump_in", 0.0), 0.35)

    emit_world_state()


@socketio.on("admin_remove_character")
def admin_remove_character(payload):
    if not isinstance(payload, dict):
        return

    username = str(payload.get("username", "")).strip()
    if not username:
        return

    with characters_lock, state_lock:
        removed = characters.pop(username.lower(), None)
        if removed is None:
            return
        character_states.pop(username.lower(), None)
        serialized = [asdict(char) for char in characters.values()]

    socketio.emit("characters_updated", serialized)
    emit_world_state()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    ensure_physics_thread_started()
    socketio.run(app, **build_socketio_run_kwargs(port))
