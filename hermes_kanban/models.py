"""
Hermes Kanban — Data models
"""
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional, List


STATUSES = ("backlog", "ready", "running", "done", "blocked", "failed", "archived")
PRIORITIES = {"normal": 0, "high": 1, "low": 2}
WORKFLOWS = ("auto", "ask", "plan")


def ts_to_iso(ts):
    """Convert unix timestamp to ISO 8601 string."""
    if not ts:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@dataclass
class Task:
    id: str
    title: str
    body: Optional[str] = None
    assignee: Optional[str] = None
    status: str = "backlog"
    priority: int = 0
    created_at: int = 0
    started_at: Optional[int] = None
    completed_at: Optional[int] = None
    result: Optional[str] = None
    workspace_kind: Optional[str] = None
    created_by: Optional[str] = None
    workflow: str = "auto"
    completion_note: Optional[str] = None
    comments: List["Comment"] = field(default_factory=list)

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "body": self.body,
            "assignee": self.assignee,
            "status": self.status,
            "priority": self.priority,
            "created_at": ts_to_iso(self.created_at),
            "started_at": ts_to_iso(self.started_at),
            "completed_at": ts_to_iso(self.completed_at),
            "result": self.result,
            "workspace_kind": self.workspace_kind,
            "created_by": self.created_by,
            "workflow": self.workflow,
            "completion_note": self.completion_note,
            "comments": [c.to_dict() for c in self.comments],
        }

    @classmethod
    def from_row(cls, row):
        return cls(**{k: row[k] for k in row.keys()})


@dataclass
class Comment:
    id: str
    task_id: str
    body: str
    author: Optional[str] = None
    created_at: int = 0

    def to_dict(self):
        return {
            "id": self.id,
            "task_id": self.task_id,
            "author": self.author,
            "body": self.body,
            "created_at": ts_to_iso(self.created_at),
        }

    @classmethod
    def from_row(cls, row):
        return cls(**{k: row[k] for k in row.keys()})
