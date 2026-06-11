"""
Hermes Kanban — Authentication
"""
import os
from functools import wraps
from flask import session, redirect, url_for, request, jsonify


DEFAULT_USER = "hermes"
DEFAULT_PASS = "hermes"


def get_auth_config():
    """Get auth config from environment or defaults."""
    return {
        "user": os.getenv("KANBAN_AUTH_USER", DEFAULT_USER),
        "pass": os.getenv("KANBAN_AUTH_PASS", DEFAULT_PASS),
    }


def _is_authenticated():
    """Check auth: session cookie OR Basic Auth."""
    if session.get("logged_in"):
        return True
    auth = request.authorization
    config = get_auth_config()
    if auth and auth.username == config["user"] and auth.password == config["pass"]:
        return True
    return False


def login_required(f):
    """Decorator to require login for routes (session or Basic Auth)."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not _is_authenticated():
            if request.path.startswith("/api/"):
                return jsonify({"error": "Authentication required"}), 401
            return redirect(url_for("login_page"))
        return f(*args, **kwargs)
    return decorated


def check_credentials(username, password):
    """Check if credentials are valid."""
    config = get_auth_config()
    return username == config["user"] and password == config["pass"]
