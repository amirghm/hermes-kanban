"""
Hermes Kanban — Telegram notifications (optional)
"""
import os
import json
import requests


STATUS_EMOJI = {
    "backlog": "📋", "ready": "🚀", "running": "⚡",
    "done": "✅", "blocked": "🚫", "failed": "❌", "archived": "📦",
}

STATUS_LABEL = {
    "backlog": "Backlog", "ready": "Ready", "running": "In Progress",
    "done": "Done", "blocked": "Blocked", "failed": "Failed", "archived": "Archived",
}


class Notifier:
    """Telegram notification handler."""

    def __init__(self, bot_token=None, chat_id=None):
        self.bot_token = bot_token or os.getenv("TELEGRAM_BOT_TOKEN")
        self.chat_id = chat_id or os.getenv("TELEGRAM_HOME_CHANNEL")
        self.enabled = bool(self.bot_token and self.chat_id)

    def send(self, text, parse_mode="HTML"):
        """Send a message via Telegram."""
        if not self.enabled:
            return None
        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        payload = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": parse_mode,
        }
        try:
            r = requests.post(url, json=payload, timeout=10)
            data = r.json()
            if data.get("ok"):
                return data["result"]["message_id"]
        except Exception as e:
            print(f"[TG] Send error: {e}")
        return None

    def notify_task(self, task, event, old_status=None):
        """Send a task change notification."""
        title = task.get("title", "Untitled")
        body = (task.get("body") or "").strip()
        task_id = task.get("id", "")
        status = task.get("status", "backlog")
        assignee = task.get("assignee", "Unassigned")
        priority = task.get("priority", 0)
        prio_text = ["Normal", "High", "Low"][priority] if priority in [0, 1, 2] else "Normal"

        status_label = STATUS_LABEL.get(status, status)
        lines = [
            f"<b>{event}</b>",
            "",
            f"<b>{title}</b>",
        ]
        if body:
            lines.append(f"<i>{body}</i>")
        lines += [
            "",
            f"ID: <code>{task_id}</code>",
            f"Assignee: {assignee}",
            f"Priority: {prio_text}",
            f"Status: {status_label}",
        ]
        if old_status and old_status != status:
            old_label = STATUS_LABEL.get(old_status, old_status)
            lines.append(f"Changed: {old_label} → {status_label}")

        return self.send("\n".join(lines))
