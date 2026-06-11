"""
Hermes Kanban — REST API routes
"""
import uuid
import threading
from datetime import datetime

from flask import Blueprint, jsonify, request

from .db import get_db
from .models import Task, Comment, ts_to_iso, STATUSES


api = Blueprint("api", __name__)

# Global notifier (set by server.py)
notifier = None


def set_notifier(n):
    global notifier
    notifier = n


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
