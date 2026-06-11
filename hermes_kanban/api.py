"""
Hermes Kanban — REST API routes
"""
import json
import os
import re
import uuid
import threading
from datetime import datetime
from pathlib import Path

from flask import Blueprint, jsonify, request

from .db import get_db
from .models import Task, Comment, ts_to_iso, STATUSES


api = Blueprint("api", __name__)

# Global notifier (set by server.py)
notifier = None

AGENT_COLORS = [
    "#e5ad2f",
    "#4f8ee8",
    "#d66fa8",
    "#9175dc",
    "#2fa9b5",
    "#4aa96c",
    "#d9803a",
]
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def set_notifier(n):
    global notifier
    notifier = n


def _profiles_dir():
    return Path.home() / ".hermes" / "profiles"


def _agents_config_path():
    return Path.home() / ".hermes" / "kanban" / "agents.json"


def _discover_hermes_agents():
    profiles_dir = _profiles_dir()
    if not profiles_dir.is_dir():
        return []

    agents = []
    profile_dirs = sorted(
        (path for path in profiles_dir.iterdir() if path.is_dir()),
        key=lambda path: path.name.lower(),
    )
    for index, profile_dir in enumerate(profile_dirs):
        display_name = profile_dir.name
        soul_path = profile_dir / "SOUL.md"
        try:
            first_line = soul_path.open(encoding="utf-8").readline().strip()
            if first_line:
                display_name = first_line.lstrip("#").strip() or display_name
        except (OSError, UnicodeError):
            pass
        agents.append({
            "name": profile_dir.name,
            "display_name": display_name,
            "color": AGENT_COLORS[index % len(AGENT_COLORS)],
            "source": "hermes",
        })
    return agents


def _load_custom_agents():
    config_path = _agents_config_path()
    try:
        data = json.loads(config_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []
    except (OSError, UnicodeError, json.JSONDecodeError):
        return []

    if not isinstance(data, list):
        return []
    return [
        {
            "name": agent["name"],
            "display_name": agent["display_name"],
            "color": agent["color"],
        }
        for agent in data
        if isinstance(agent, dict)
        and isinstance(agent.get("name"), str)
        and isinstance(agent.get("display_name"), str)
        and isinstance(agent.get("color"), str)
    ]


def _save_custom_agents(agents):
    config_path = _agents_config_path()
    config_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = config_path.with_suffix(".tmp")
    temp_path.write_text(
        json.dumps(agents, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    os.replace(temp_path, config_path)


def _agent_config():
    hermes_agents = _discover_hermes_agents()
    hermes_names = {agent["name"] for agent in hermes_agents}
    custom_agents = [
        {**agent, "source": "custom"}
        for agent in _load_custom_agents()
        if agent["name"] not in hermes_names
    ]
    return hermes_agents + custom_agents


@api.route("/api/agents/config")
def get_agent_config():
    return jsonify(_agent_config())


@api.route("/api/agents", methods=["POST"])
def add_custom_agent():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "JSON body is required"}), 400

    name = data.get("name")
    display_name = data.get("display_name")
    color = data.get("color")
    if not all(isinstance(value, str) for value in (name, display_name, color)):
        return jsonify({
            "error": "name, display_name, and a #RRGGBB color are required"
        }), 400

    name = name.strip()
    display_name = display_name.strip()
    color = color.strip()
    if not name or "/" in name or not display_name or not COLOR_RE.fullmatch(color):
        return jsonify({
            "error": "name, display_name, and a #RRGGBB color are required"
        }), 400

    if name in {agent["name"] for agent in _discover_hermes_agents()}:
        return jsonify({"error": "Cannot replace an auto-detected agent"}), 409

    agents = _load_custom_agents()
    if any(agent["name"] == name for agent in agents):
        return jsonify({"error": "Agent already exists"}), 409

    agent = {"name": name, "display_name": display_name, "color": color}
    agents.append(agent)
    _save_custom_agents(agents)
    return jsonify({**agent, "source": "custom"}), 201


@api.route("/api/agents/<name>", methods=["DELETE"])
def delete_custom_agent(name):
    if name in {agent["name"] for agent in _discover_hermes_agents()}:
        return jsonify({"error": "Cannot remove an auto-detected agent"}), 400

    agents = _load_custom_agents()
    remaining = [agent for agent in agents if agent["name"] != name]
    if len(remaining) == len(agents):
        return jsonify({"error": "Custom agent not found"}), 404

    _save_custom_agents(remaining)
    return jsonify({"ok": True})


@api.route("/api/tasks")
def get_tasks():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, title, body, assignee, status, priority,
               created_at, started_at, completed_at, result,
               workspace_kind, created_by, workflow, completion_note
        FROM tasks
        ORDER BY
            CASE status
                WHEN 'running' THEN 0
                WHEN 'ready' THEN 1
                WHEN 'backlog' THEN 2
                WHEN 'done' THEN 3
                WHEN 'blocked' THEN 4
                WHEN 'failed' THEN 5
            END,
            created_at DESC
    """)
    tasks = [Task.from_row(row).to_dict() for row in cursor.fetchall()]
    conn.close()
    return jsonify({"tasks": tasks})


@api.route("/api/tasks/<task_id>")
def get_task(task_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Not found"}), 404

    task = Task.from_row(row)
    cursor.execute(
        "SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at",
        (task_id,),
    )
    task.comments = [Comment.from_row(c) for c in cursor.fetchall()]
    conn.close()
    return jsonify(task.to_dict())


@api.route("/api/tasks", methods=["POST"])
def create_task():
    data = request.get_json()
    if not data or not data.get("title"):
        return jsonify({"error": "Title is required"}), 400

    task_id = f"t_{uuid.uuid4().hex[:8]}"
    now = int(datetime.now().timestamp())
    title = data["title"].strip()
    body = (data.get("body") or "").strip() or None
    assignee = (data.get("assignee") or "").strip().lower() or None
    priority = int(data.get("priority", 1))
    workflow = (data.get("workflow") or "auto").strip()
    if workflow not in ("auto", "ask", "plan"):
        workflow = "auto"

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO tasks (id, title, body, assignee, status, priority,
                              created_by, created_at, workspace_kind, workflow)
           VALUES (?, ?, ?, ?, 'backlog', ?, 'web-ui', ?, 'scratch', ?)""",
        (task_id, title, body, assignee, priority, now, workflow),
    )
    conn.commit()
    cursor.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
    task = Task.from_row(cursor.fetchone())
    conn.close()

    if assignee and notifier:
        threading.Thread(
            target=notifier.notify_task,
            args=(task.to_dict(), "📋 Task Created"),
            daemon=True,
        ).start()

    return jsonify(task.to_dict()), 201


@api.route("/api/tasks/<task_id>", methods=["PUT"])
def update_task(task_id):
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data"}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Not found"}), 404

    old_status = row["status"]
    now = int(datetime.now().timestamp())

    allowed = {"title", "body", "assignee", "priority", "status", "workflow", "completion_note"}
    updates = {}
    for key in allowed:
        if key in data:
            val = data[key]
            if key in ("title", "body", "assignee", "completion_note"):
                val = val.strip() if val else None
                if key == "assignee" and val:
                    val = val.lower()
            elif key == "priority":
                val = int(val)
            elif key == "workflow":
                if val not in ("auto", "ask", "plan"):
                    val = "auto"
            elif key == "status":
                if val not in STATUSES:
                    conn.close()
                    return jsonify({"error": "Invalid status"}), 400
            updates[key] = val

    new_status = updates.get("status", old_status)
    if new_status == "running" and old_status != "running":
        updates["started_at"] = now
    elif new_status == "done" and old_status != "done":
        updates["completed_at"] = now

    if not updates:
        conn.close()
        return jsonify({"error": "No fields to update"}), 400

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [task_id]
    cursor.execute(f"UPDATE tasks SET {set_clause} WHERE id = ?", values)
    conn.commit()

    cursor.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
    task = Task.from_row(cursor.fetchone())
    conn.close()

    if old_status != new_status and notifier:
        status_events = {
            "ready": "🚀 Task Ready", "running": "⚡ Task In Progress",
            "done": "✅ Task Completed", "blocked": "🚫 Task Blocked",
            "failed": "❌ Task Failed", "backlog": "📋 Task Backlog",
        }
        event = status_events.get(new_status, f"Status → {new_status}")
        threading.Thread(
            target=notifier.notify_task,
            args=(task.to_dict(), event, old_status),
            daemon=True,
        ).start()

    return jsonify(task.to_dict())


@api.route("/api/tasks/<task_id>/status", methods=["PUT"])
def update_status(task_id):
    data = request.get_json()
    new_status = data.get("status")
    if new_status not in STATUSES:
        return jsonify({"error": "Invalid status"}), 400

    now = int(datetime.now().timestamp())
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Not found"}), 404

    old_status = row["status"]
    updates = {"status": new_status}
    if new_status == "running" and old_status != "running":
        updates["started_at"] = now
    elif new_status == "done":
        updates["completed_at"] = now

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [task_id]
    cursor.execute(f"UPDATE tasks SET {set_clause} WHERE id = ?", values)
    conn.commit()

    cursor.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
    task = Task.from_row(cursor.fetchone())
    conn.close()

    if old_status != new_status and notifier:
        status_events = {
            "ready": "🚀 Task Ready", "running": "⚡ Task In Progress",
            "done": "✅ Task Completed", "blocked": "🚫 Task Blocked",
            "failed": "❌ Task Failed", "backlog": "📋 Task Backlog",
        }
        event = status_events.get(new_status, f"Status → {new_status}")
        threading.Thread(
            target=notifier.notify_task,
            args=(task.to_dict(), event, old_status),
            daemon=True,
        ).start()

    return jsonify(task.to_dict())


@api.route("/api/tasks/<task_id>", methods=["DELETE"])
def delete_task(task_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM tasks WHERE id = ?", (task_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"error": "Not found"}), 404
    cursor.execute("DELETE FROM task_comments WHERE task_id = ?", (task_id,))
    cursor.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@api.route("/api/stats")
def get_stats():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT status, COUNT(*) FROM tasks GROUP BY status")
    stats = {row[0]: row[1] for row in cursor.fetchall()}
    cursor.execute("SELECT COUNT(*) FROM tasks")
    stats["total"] = cursor.fetchone()[0]
    conn.close()
    return jsonify(stats)


@api.route("/api/agents")
def get_agents():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT assignee, COUNT(*) as total,
               SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
               SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as active
        FROM tasks
        WHERE assignee IS NOT NULL
        GROUP BY assignee
    """)
    agents = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify({"agents": agents})


@api.route("/api/tasks/<task_id>/comments", methods=["POST"])
def add_comment(task_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM tasks WHERE id = ?", (task_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"error": "Task not found"}), 404

    data = request.get_json()
    body = (data.get("body") or "").strip()
    if not body:
        conn.close()
        return jsonify({"error": "Comment body required"}), 400

    comment_id = f"c_{uuid.uuid4().hex[:8]}"
    now = int(datetime.now().timestamp())
    author = (data.get("author") or "anonymous").strip()

    cursor.execute(
        "INSERT INTO task_comments (id, task_id, author, body, created_at) VALUES (?, ?, ?, ?, ?)",
        (comment_id, task_id, author, body, now),
    )
    conn.commit()
    conn.close()
    return jsonify({"id": comment_id, "task_id": task_id, "author": author, "body": body}), 201
