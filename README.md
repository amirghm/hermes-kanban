# Hermes Kanban

Lightweight Kanban board for [Hermes Agent](https://hermes-agent.nousresearch.com). SQLite-backed, dark theme, drag & drop, Telegram notifications.

## Quick Start

```bash
pip install hermes-kanban
hermes-kanban serve
```

Open **http://localhost:9120** — Login: `hermes` / `hermes`

## Features

- **SQLite backend** — no external database needed
- **Dark theme** — clean, modern UI
- **Drag & drop** — move tasks between columns
- **Agent workload** — see who's doing what
- **Telegram notifications** — get notified on task changes
- **REST API** — integrate with Hermes gateway or any tool
- **Basic auth** — protect your board (default: hermes/hermes)

## Installation

### From PyPI (recommended)

```bash
pip install hermes-kanban
hermes-kanban serve --port 9120
```

### From source

```bash
git clone https://github.com/2D-Soft/hermes-kanban.git
cd hermes-kanban
pip install -e .
hermes-kanban serve
```

## Configuration

All settings are optional via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `KANBAN_PORT` | `9120` | Server port |
| `KANBAN_HOST` | `0.0.0.0` | Bind address |
| `KANBAN_AUTH_USER` | `hermes` | Login username |
| `KANBAN_AUTH_PASS` | `hermes` | Login password |
| `KANBAN_NO_AUTH` | `0` | Set to `1` to disable auth |
| `KANBAN_DB` | auto | Custom database path |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token (optional) |
| `TELEGRAM_HOME_CHANNEL` | — | Telegram chat ID (optional) |

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tasks` | List all tasks |
| `GET` | `/api/tasks/<id>` | Get task details |
| `POST` | `/api/tasks` | Create task |
| `PUT` | `/api/tasks/<id>` | Update task |
| `PUT` | `/api/tasks/<id>/status` | Change status |
| `DELETE` | `/api/tasks/<id>` | Delete task |
| `GET` | `/api/stats` | Status counts |
| `GET` | `/api/agents` | Agent workload |
| `POST` | `/api/tasks/<id>/comments` | Add comment |

### Example: Create a task

```bash
curl -X POST http://localhost:9120/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Fix login bug", "assignee": "dariush", "priority": 1}'
```

## Database

Tasks are stored in SQLite at `~/.hermes/kanban.db` (or board-specific path).

To use a custom database:

```bash
hermes-kanban serve --db /path/to/my-tasks.db
```

## Hermes Gateway Integration

Hermes Agent auto-discovers the Kanban board via SQLite. Just start the server and agents can create/update tasks via API.

## License

MIT
