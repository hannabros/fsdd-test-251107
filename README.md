# Document Workspace

React + FastAPI workspace that follows the planning doc in `AGENTS.md`: upload PDF source files into projects, manage Azure-bound metadata, and keep the insight panel ready for future expansion.

## Project Layout

```
frontend/          # Vite + React UI for projects + agent console
backend/           # FastAPI server, SQLite models, file handlers
backend/durable_func/  # Azure Durable Functions (Python) orchestrator
.env.example
```

## Prerequisites

- Node.js 18+ (`npm` available on your PATH)
- Python 3.8+ (system already has 3.8.10)
- Azure AI/Search keys (fill into `.env`)
- Azure Durable Functions tooling (Functions Core Tools v4 + Azurite or Azure Storage account) for the agent orchestrator

## Backend Setup (`~/.venv`)

```bash
cp .env.example .env                      # update with Azure + DB + durable settings
python3 -m venv ~/.venv                   # already created by this run
source ~/.venv/bin/activate               # activate virtualenv
pip install -r backend/requirements.txt   # install FastAPI stack
cd backend
uvicorn app.main:app --reload --port 8000
```

New `.env` keys:
- `DURABLE_FUNCTIONS_BASE_URL` (default `http://localhost:7071`)
- `DURABLE_FUNCTIONS_HUMAN_EVENT` (default `HumanApproval`)

Key endpoints (see `backend/app/routers`):
- `GET /projects` / `POST /projects` / `PUT /projects/{id}` / `DELETE /projects/{id}`
- `GET /projects/{id}` returns project + `SourceFile` list
- `POST /projects/{id}/files` accepts PDF upload, stores metadata, triggers stub background processor
- `DELETE /files/{file_id}` removes metadata + stored file
- `POST /agent-runs` starts an Azure Durable Functions research run (passes through the orchestrator)
- `GET /agent-runs/{run_id}` proxies the orchestration status (202 for running, 200 with output when complete)
- `POST /agent-runs/{run_id}/human-feedback` sends the `continue`/`cancel` decision back to the human-approval checkpoint

All project data persists in `backend/project_db.sqlite`, uploaded blobs live under `backend/storage/<project_id>/`, and agent run metadata is tracked in the `agent_runs` table to bridge the FastAPI API with Durable Functions.

### Durable Functions Orchestrator (`backend/durable_func`)

This directory contains the original Azure Functions app (Python 3.11) that orchestrates the AI research workflow. Run it alongside FastAPI:

```bash
cd backend/durable_func
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
func start --python
```

Ensure `AZURE_OPENAI_*`, `AZURE_AI_SEARCH_*`, and storage settings are present in `local.settings.json`. When running locally, the FastAPI service proxies calls to `http://localhost:7071/api/httptrigger` (configurable via `.env`).

## Frontend Setup (`frontend/`)

```bash
cd frontend
cp .env.example .env          # set VITE_API_BASE_URL (defaults to http://localhost:8000)
npm install                   # install React/Vite deps
npm run dev                   # launch Vite dev server (default http://localhost:5173)
```

The UI mirrors the spec:
- Workspace header with editable project name + “My Projects” modal
- Left workspace card for file uploads/list/deletion via backend APIs
- Three-column research console (agent trigger, history, markdown preview) styled after the durable-agent prototype

## Next Steps

1. Wire Azure Document Intelligence + Search logic inside `workers.process_file`.
2. Expand the new `/agent-runs` pipeline to automatically scope research to the active project’s indexed documents.
3. Add auth/multi-user context if needed.
