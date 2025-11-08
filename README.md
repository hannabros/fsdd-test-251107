# Document Workspace

React + FastAPI workspace that follows the planning doc in `AGENTS.md`: upload PDF source files into projects, manage Azure-bound metadata, and keep the insight panel ready for future expansion.

## Project Layout

```
frontend/  # Vite + React UI for managing projects/files
backend/   # FastAPI server, SQLite models, file handlers
.env.example
```

## Prerequisites

- Node.js 18+ (`npm` available on your PATH)
- Python 3.8+ (system already has 3.8.10)
- Azure AI/Search keys (fill into `.env`)

## Backend Setup (`~/.venv`)

```bash
cp .env.example .env                      # update with Azure + DB settings
python3 -m venv ~/.venv                   # already created by this run
source ~/.venv/bin/activate               # activate virtualenv
pip install -r backend/requirements.txt   # install FastAPI stack
cd backend
uvicorn app.main:app --reload --port 8000
```

Key endpoints (see `backend/app/routers`):
- `GET /projects` / `POST /projects` / `PUT /projects/{id}` / `DELETE /projects/{id}`
- `GET /projects/{id}` returns project + `SourceFile` list
- `POST /projects/{id}/files` accepts PDF upload, stores metadata, triggers stub background processor
- `DELETE /files/{file_id}` removes metadata + stored file

All data persists in `backend/project_db.sqlite`, and uploaded blobs live under `backend/storage/<project_id>/`.

## Frontend Setup (`frontend/`)

```bash
cd frontend
cp .env.example .env          # set VITE_API_BASE_URL (defaults to http://localhost:8000)
npm install                   # install React/Vite deps
npm run dev                   # launch Vite dev server (default http://localhost:5173)
```

The UI mirrors the spec:
- Workspace header with editable project name + “My Projects” modal
- Left panel for file uploads/list/deletion via backend APIs
- Right panel reserved for Insights/Q&A

## Next Steps

1. Wire Azure Document Intelligence + Search logic inside `workers.process_file`.
2. Replace the static insights placeholder with retrieval/Q&A powered by the indexed data.
3. Add auth/multi-user context if needed.
