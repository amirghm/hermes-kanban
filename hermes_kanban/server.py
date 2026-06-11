"""
Hermes Kanban — Main server
"""
import os
import secrets
from pathlib import Path

from flask import Flask, send_from_directory, session, redirect, url_for, request, Response, jsonify
from flask_cors import CORS

from .db import init_db, resolve_db_path
from .api import api, set_notifier
from .auth import check_credentials, login_required
from .notifier import Notifier


def create_app(db_path=None, auth=True):
    """Create and configure the Flask application."""
    static_dir = Path(__file__).parent.parent / "static"
    app = Flask(__name__, static_folder=str(static_dir))
    CORS(app)
    app.secret_key = secrets.token_hex(32)

    # Initialize database
    db_path = resolve_db_path(db_path)
    init_db(db_path)

    # Setup notifier
    notifier = Notifier()
    set_notifier(notifier)

    # Register API blueprint
    app.register_blueprint(api)

    # Auth config
    auth_enabled = auth and os.getenv("KANBAN_NO_AUTH") != "1"

    @app.before_request
    def protect_static():
        if request.path.startswith("/static/"):
            if not session.get("logged_in"):
                return Response("Authentication required.", 401)

    @app.route("/login", methods=["GET", "POST"])
    def login_page():
        if request.method == "POST":
            data = request.get_json() if request.is_json else request.form
            username = data.get("username", "")
            password = data.get("password", "")
            if check_credentials(username, password):
                session["logged_in"] = True
                return (
                    jsonify({"ok": True})
                    if request.is_json
                    else redirect(url_for("index"))
                )
            return jsonify({"error": "Invalid credentials"}), 401
        return send_from_directory(str(static_dir), "login.html")

    @app.route("/logout")
    def logout():
        session.clear()
        return redirect(url_for("login_page"))

    @app.route("/")
    @login_required
    def index():
        return send_from_directory(str(static_dir), "index.html")

    @app.route("/health")
    def health():
        return jsonify({"status": "ok", "version": "1.0.0"})

    return app


def main():
    """CLI entry point."""
    import argparse
    import sys

    parser = argparse.ArgumentParser(
        prog="hermes-kanban",
        description="Lightweight Kanban board for Hermes Agent",
    )
    subparsers = parser.add_subparsers(dest="command")

    # Default: run serve
    serve_parser = subparsers.add_parser("serve", help="Start the server")
    serve_parser.add_argument("--port", type=int, default=int(os.getenv("KANBAN_PORT", "9120")))
    serve_parser.add_argument("--host", default=os.getenv("KANBAN_HOST", "0.0.0.0"))
    serve_parser.add_argument("--db", default=None, help="Database path")
    serve_parser.add_argument("--no-auth", action="store_true", help="Disable authentication")

    # Also allow direct flags without 'serve'
    parser.add_argument("--port", type=int, default=int(os.getenv("KANBAN_PORT", "9120")))
    parser.add_argument("--host", default=os.getenv("KANBAN_HOST", "0.0.0.0"))
    parser.add_argument("--db", default=None, help="Database path")
    parser.add_argument("--no-auth", action="store_true", help="Disable authentication")

    args = parser.parse_args()

    # Handle both: `hermes-kanban serve --port 9120` and `hermes-kanban --port 9120`
    if args.command == "serve":
        port = args.port
        host = args.host
        db = args.db
        no_auth = args.no_auth
    else:
        port = args.port
        host = args.host
        db = args.db
        no_auth = args.no_auth

    app = create_app(db_path=db, auth=not no_auth)

    db_path = resolve_db_path(db)
    print(f"Hermes Kanban v1.0.0")
    print(f"Server: http://{host}:{port}")
    print(f"Database: {db_path}")
    print(f"Auth: {'disabled' if no_auth else 'enabled (hermes/hermes)'}")

    app.run(host=host, port=port, debug=False)


if __name__ == "__main__":
    main()
