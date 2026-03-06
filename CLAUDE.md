# kaspi-reviews

## Stack
- **Backend:** Django + Django REST Framework · Python 3.12
- **Frontend:** React 18 (JSX) · Vite · plain JavaScript (no TypeScript)
- **Database:** SQLite (dev)
- **Virtualenv:** `.venv/`
- **Settings:** `config/settings.py`

## Project Structure
```
/
├── config/          # Django config (settings, urls, wsgi, asgi)
├── main/            # Main Django app (models, views, serializers, services)
├── frontend/        # React + Vite SPA
│   └── src/         # JSX source files
├── .claude/         # Claude Code settings
└── manage.py
```

## Commands
- **Backend:** `python manage.py runserver`
- **Frontend:** `cd frontend && npm run dev`
- **Frontend build:** `cd frontend && npm run build`
- **Migrations:** `python manage.py makemigrations && python manage.py migrate`
- **Tests:** `python manage.py test`
- **Shell:** `python manage.py shell`
- **Install deps:** `pip install -r requirements.txt` (always inside `.venv`)

## Rules
- Always use `.venv` for Python — never system Python
- Never commit `.env` — reference `.env.example` for required keys
- Never manually commit `frontend/dist/` — it is build output
- Keep `requirements.txt` updated after `pip install`

## Git Conventions
- Branches: `feat/short-name` · `fix/short-name` · `chore/short-name`
- Commits: `feat: add review scraping` (Conventional Commits)
- **After every change, make a git commit** — stage only relevant files (never `.env`), use Conventional Commits format

## Reference Docs (load on demand, not auto-loaded)
- `@docs/architecture.md` — system design & key decisions
- `@docs/tasks.md` — task tracker with checkboxes
