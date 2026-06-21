# hermes-kanban

<p align="center">
  <a href="https://pypi.org/project/hermes-kanban/">
    <img src="https://img.shields.io/pypi/v/hermes-kanban?color=blue&label=pypi" alt="PyPI">
  </a>
  <a href="https://pypi.org/project/hermes-kanban/">
    <img src="https://img.shields.io/pypi/pyversions/hermes-kanban?label=python" alt="Python">
  </a>
  <a href="https://github.com/amirghm/hermes-kanban/blob/main/LICENSE">
    <img src="https://img.shields.io/pypi/l/hermes-kanban?color=green" alt="License">
  </a>
  <a href="https://github.com/amirghm/hermes-kanban">
    <img src="https://img.shields.io/github/stars/amirghm/hermes-kanban?style=social" alt="Stars">
  </a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/NousResearch/hermes-agent/main/assets/banner.png" alt="Hermes Agent" width="800">
</p>


<p align="center">
  <video src="https://github.com/user-attachments/assets/1a7bca5f-c505-489b-a4bd-2cfa5407cc4a" width="800" controls autoplay muted loop></video>
</p>


<p align="center">
  <img src="https://raw.githubusercontent.com/amirghm/hermes-kanban/codex/dynamic-agents/docs/screenshot-dark.png" alt="Dark Theme" width="800">
</p>

A lightweight, self-contained Kanban board built for [Hermes Agent](https://hermes-agent.nousresearch.com). Zero external dependencies — just SQLite, Flask, and a single `pip install`.

## What is this?

Hermes Kanban gives your AI agents a shared task board. Agents create, update, and complete tasks through a REST API. You monitor everything through a clean web UI with drag-and-drop, dark/light themes, and real-time updates.

**Agents are auto-detected from your Hermes profiles** — no configuration needed. Install it, start it, and your agents appear automatically.

## Quick Start

```bash
pip install hermes-kanban
hermes-kanban serve
```

Open **http://localhost:9120** — Login: `hermes` / `hermes`

That's it. Your agents from `~/.hermes/profiles/` are already on the board.

## Features

- **Auto-detect agents** — scans `~/.hermes/profiles/` and pulls names + descriptions from `SOUL.md`
- **Dark & Light themes** — toggle with one click, respects your preference
- **Responsive design** — works on desktop and mobile
- **Drag & drop** — move tasks between columns visually
- **SQLite backend** — no database server needed, single file storage
- **REST API** — full CRUD for tasks, agents, and comments
- **Telegram notifications** — optional, get notified on task changes
- **Basic auth** — protect your board (configurable)
- **Export** — download your tasks as JSON anytime

## Screenshots

**Dark Theme**

<p align="center">
  <img src="https://raw.githubusercontent.com/amirghm/hermes-kanban/codex/dynamic-agents/docs/screenshot-dark.png" alt="Dark Theme" width="800">
</p>

**Light Theme**

<p align="center">
  <img src="https://raw.githubusercontent.com/amirghm/hermes-kanban/codex/dynamic-agents/docs/screenshot-light.png" alt="Light Theme" width="800">
</p>

**Mobile**

<p align="center">
  <img src="https://raw.githubusercontent.com/amirghm/hermes-kanban/codex/dynamic-agents/docs/screenshot-mobile.png" alt="Mobile Dark" width="300">
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/amirghm/hermes-kanban/codex/dynamic-agents/docs/screenshot-mobile-light.png" alt="Mobile Light" width="300">
</p>

## How Agent Detection Works

```
~/.hermes/profiles/
  kaveh/SOUL.md      → "# Kaveh — Team Lead"
  dariush/SOUL.md    → "# Dariush — Developer"
  emily/SOUL.md      → "# Emily — Friend & Companion"
  yasaman/SOUL.md    → "# Yasaman — QA Engineer"
```

Hermes Kanban reads each profile folder, extracts the first line of `SOUL.md` as the display name, and assigns a color. **Add a new profile → it appears on the board automatically.**

You can also add agents manually via `POST /api/agents` — these show up with `source: "custom"`.

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

## REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tasks` | List all tasks |
| `GET` | `/api/tasks/<id>` | Get task details |
| `POST` | `/api/tasks` | Create a task |
| `PUT` | `/api/tasks/<id>` | Update a task |
| `PUT` | `/api/tasks/<id>/status` | Change task status |
| `DELETE` | `/api/tasks/<id>` | Delete a task |
| `GET` | `/api/stats` | Task counts by status |
| `GET` | `/api/agents` | Agent workload |
| `GET` | `/api/agents/config` | Auto-detected agents |
| `POST` | `/api/agents` | Add a custom agent |
| `DELETE` | `/api/agents/<name>` | Remove a custom agent |
| `POST` | `/api/tasks/<id>/comments` | Add a comment |

### Create a task

```bash
curl -X POST http://localhost:9120/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fix login bug",
    "description": "Users cant login with SSO",
    "assignee": "dariush",
    "priority": 1,
    "status": "todo"
  }'
```

### List agents

```bash
curl http://localhost:9120/api/agents/config
```

```json
[
  {
    "name": "dariush",
    "display_name": "Dariush — Developer",
    "color": "#4f8ee8",
    "source": "hermes"
  }
]
```

## Hermes Integration

Hermes Agent discovers the Kanban board via SQLite. Once the server is running, agents can:

1. **Create tasks** via `POST /api/tasks`
2. **Update status** via `PUT /api/tasks/<id>/status`
3. **Add comments** via `POST /api/tasks/<id>/comments`
4. **Check workload** via `GET /api/agents`

Agents see each other's tasks and can pick up work from any column.

## Development

```bash
git clone https://github.com/2D-Soft/hermes-kanban.git
cd hermes-kanban
pip install -e .
hermes-kanban serve --port 9121
```

## License

MIT
