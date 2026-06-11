"""
Hermes Kanban — Database layer (SQLite)
"""
import os
import sqlite3
from pathlib import Path


DEFAULT_DB_DIR = Path.home() / ".hermes" / "kanban" / "boards"
DEFAULT_DB_FILE = Path.home() / ".hermes" / "kanban.db"


def resolve_db_path(db_path=None):
    """Resolve the database path from config or defaults."""
    if db_path:
        return Path(db_path)
    
    # Check for active board
    current_file = Path.home() / ".hermes" / "kanban" / "current"
    if current_file.exists():
        slug = current_file.read_text().strip()
        board_db = DEFAULT_DB_DIR / slug / "kanban.db"
        if board_db.exists():
            return board_db
    
    return DEFAULT_DB_FILE


def get_db(db_path=None):
    """Get a database connection with Row factory."""
    db_path = resolve_db_path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path=None):
    """Initialize the database schema."""
    conn = get_db(db_path)
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            body TEXT,
            assignee TEXT,
            status TEXT NOT NULL DEFAULT 'backlog',
            priority INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            started_at INTEGER,
            completed_at INTEGER,
            result TEXT,
            workspace_kind TEXT,
            created_by TEXT,
            workflow TEXT DEFAULT 'auto',
            completion_note TEXT
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS task_comments (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            author TEXT,
            body TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY(task_id) REFERENCES tasks(id)
        )
    """)
    
    # Migrate: add columns if missing
    for col, default in [
        ("workflow", "auto"),
        ("completion_note", None),
    ]:
        try:
            if default:
                cursor.execute(f"ALTER TABLE tasks ADD COLUMN {col} TEXT DEFAULT '{default}'")
            else:
                cursor.execute(f"ALTER TABLE tasks ADD COLUMN {col} TEXT")
        except sqlite3.OperationalError:
            pass
    
    conn.commit()
    conn.close()
