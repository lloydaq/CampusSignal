# CampusSignal

CampusSignal is a small, reproducible campus incident intelligence platform. It gives a campus operations team one place to report incidents, preserve original reports, understand deterministic priority scoring, review possible duplicates, and track status and resolution evidence.

## The problem

Campus incident reports can be scattered across conversations and forms. Similar reports can be mistaken for separate emergencies, while genuinely urgent issues can be difficult to prioritize. Even after a report is acknowledged, teams need a traceable record of what changed and how it was resolved.

## The solution

CampusSignal combines a browser-based reporting and management workspace with a FastAPI backend and SQLite persistence. Every report receives a stable ID and remains preserved. Priority factors and duplicate signals are returned as explanations rather than opaque decisions. A persisted Signal Trail records the supported workflow:

```text
reported → triaged → in_progress → resolved → closed
```

## Main features

- Incident reporting with backend validation.
- Persistent SQLite incident storage.
- Dashboard metrics derived from real API data.
- Queue search and status/category/priority filtering.
- Incident detail panel with severity, location, reporter, timestamps, and status.
- Explainable priority scoring with individual factors and points.
- Explainable duplicate candidates with matching signals, conflicting signals, scores, and human-review explanations.
- Original reports are never silently deleted or merged.
- Validated lifecycle transitions and required resolution notes.
- Persistent status history and resolution evidence.
- Safe DOM rendering for untrusted incident content.
- Loading, empty, success, and error states.
- Responsive desktop, tablet, and mobile layouts with reduced-motion support.

## Technology stack

- Python 3.14.4
- FastAPI 0.115.6
- Pydantic 2.12.5
- SQLite
- Vanilla HTML, CSS, and JavaScript
- Uvicorn 0.34.0
- Pytest 8.3.4 and HTTPX 0.28.1 for tests
- Docker image based on `python:3.14.4-slim`

The exact dependency set is pinned in `requirements.lock`. Optional Uvicorn server extras are intentionally not installed because the application does not require them and they add platform-specific dependencies.

## Architecture

The browser serves the interface from the FastAPI application. API routes validate requests, calculate priority, evaluate duplicate candidates, and use SQLite transactions to persist incidents and status history. The frontend refreshes from `GET /api/incidents` after successful report and status operations.

```text
Browser HTML/CSS/JS
        │
        ▼
FastAPI routes + Pydantic validation
        │
        ├── priority_for / duplicate_match
        │
        ▼
SQLite: incidents + incident_status_history
```

Detailed system, lifecycle, entity, and request-flow diagrams are in [`docs/architecture.md`](docs/architecture.md). The real three-minute walkthrough is in [`docs/demo.md`](docs/demo.md).

## Project structure

```text
.
├── app/
│   ├── database.py       SQLite connection, schema initialization, transactions
│   ├── main.py           FastAPI app and API routes
│   ├── schemas.py        Pydantic request/response models and validation
│   ├── service.py        Priority and duplicate heuristics
│   └── static/
│       ├── index.html    Application structure and form
│       ├── styles.css    Visual system and responsive layout
│       └── app.js        API integration and DOM rendering
├── docs/
│   ├── architecture.md   System and data-flow documentation
│   ├── backend-audit.md  Backend correctness audit
│   └── demo.md           Judge-friendly real-data walkthrough
├── tests/test_app.py     Backend, persistence, lifecycle, and frontend-contract tests
├── Dockerfile
├── .dockerignore
├── .env.example
├── .python-version
├── requirements.txt
└── requirements.lock
```

## Prerequisites

For local development:

- Python 3.14.4. The required version is pinned in `.python-version`.
- Git.

For the container workflow:

- Docker 28+ with the Docker daemon/Desktop Linux engine running. The Docker CLI alone is not sufficient.

## Local installation

From the repository root:

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install --disable-pip-version-check -r requirements.lock
```

On Windows PowerShell, activate with:

```powershell
.venv\Scripts\Activate.ps1
python -m pip install --disable-pip-version-check -r requirements.lock
```

The lockfile has been verified in a fresh Python 3.14.4 virtual environment. It contains the exact installed dependency set for this project.

## Configuration

The application reads configuration from process environment variables. `.env.example` is a placeholder reference; the application does not automatically load a `.env` file.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_PATH` | `data/campussignal.db` | SQLite database file. Its parent directory is created when needed. |

POSIX shell example:

```bash
DATABASE_PATH=data/demo.db uvicorn app.main:app --reload
```

Windows PowerShell example:

```powershell
$env:DATABASE_PATH = "data/demo.db"
uvicorn app.main:app --reload
```

The Docker image sets `DATABASE_PATH=/app/data/campussignal.db` so the file lives in the persistent data directory.

## Run locally

```bash
uvicorn app.main:app --reload
```

Open <http://127.0.0.1:8000>. The generated interactive API documentation is at <http://127.0.0.1:8000/docs>; the OpenAPI schema is at <http://127.0.0.1:8000/openapi.json>.

Health check:

```bash
curl http://127.0.0.1:8000/health
```

Expected response:

```json
{"status":"ok"}
```

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/` | Browser application. |
| `GET` | `/health` | Readiness response. |
| `GET` | `/api/incidents` | Newest-first incidents with priority, duplicate candidates, and status history. |
| `POST` | `/api/incidents` | Validate and create an incident. |
| `PATCH` | `/api/incidents/{incident_id}` | Apply a valid status transition and optional resolution note. |

FastAPI validation errors return `422`. Missing incidents return `404`. Database exceptions roll back the current transaction and are not converted into stack traces in the frontend.

## Explainable intelligence

### Priority scoring

The deterministic score is capped at 100 and combines:

- Severity: `12 × severity`, with severity from 1 to 5.
- Category baseline: safety 20, wellbeing 15, facilities 10, technology 8, academic 6, other 4.
- Urgency language: up to 15 points for recognized terms such as `urgent`, `danger`, `emergency`, `blocked`, `fire`, and `flood`.

The API returns the score and every factor with its point contribution and explanation. These are heuristics, not calibrated probabilities.

### Duplicate candidates

Each new incident is compared to existing incidents using:

- Meaningful-word text overlap: 50%.
- Same category: 20%.
- Same normalized location: 20%.
- Reported within 24 hours: 10%.

The response includes candidate IDs, heuristic scores, matching signals, conflicting signals, and an explanation. A score of at least `0.65` sets `duplicate_of` as a review suggestion. Reports remain separate and require human review.

## Tests

The single documented test command is:

```bash
python -m pytest -q
```

JavaScript syntax check:

```bash
node --check app/static/app.js
```

The test suite covers validation, stable IDs, persistence, duplicate and unrelated reports, priority consistency, invalid transitions, resolution requirements, status history, transaction rollback, and frontend/API contract markers.

## Docker

The Docker daemon must be running before these commands can execute. The image build was not verified in the previous environment because Docker Desktop’s Linux daemon was unavailable.

Build from the repository root:

```bash
docker build -t campussignal .
```

Run with a named persistent volume:

```bash
docker volume create campussignal-data
docker run --rm --name campussignal \
  -p 8000:8000 \
  -v campussignal-data:/app/data \
  campussignal
```

The container runs as the unprivileged `campussignal` user with UID `10001`, exposes port `8000`, and writes to `/app/data/campussignal.db`. Named volumes are writable automatically. For a Linux bind mount:

```bash
mkdir -p data-container
sudo chown 10001:10001 data-container
docker run --rm --name campussignal \
  -p 8000:8000 \
  -v "$(pwd)/data-container:/app/data" \
  campussignal
```

The image includes a Docker health check for `/health`. To test persistence safely, use an isolated named volume, create an incident, remove the container, start a new container with the same volume, and call `GET /api/incidents`. Do not mount the developer’s existing `data/` directory for a smoke test.

## Demonstration

Follow [`docs/demo.md`](docs/demo.md) for a three-minute demonstration using real reports. The sequence creates a water-leak report, creates a related report to show duplicate evidence, advances a report through valid transitions, and records a resolution note. It uses a separate `data/demo.db` path so normal application data is not contaminated.

## Security considerations

- No credentials or secrets are required or committed.
- `.env` files, local databases, logs, caches, editor files, and Git metadata are excluded from the container build context.
- User-controlled text is rendered safely with DOM APIs rather than unsafe HTML interpolation.
- The container runs without root privileges.
- This application does not yet provide authentication, authorization, HTTPS termination, rate limiting, backup automation, or external audit identity.
- SQLite is suitable for this single-process deployment shape; do not assume it is ready for multi-worker or horizontally scaled production use.

## Known limitations

- No authentication or role-based permissions.
- Duplicate detection is heuristic and not calibrated against campus data.
- No assignment, notifications, SLAs, pagination, or server-side search.
- Legacy records created before status-history support may have no history entries.
- Docker build and container smoke verification remain dependent on a running Docker daemon.
- The current deployment is intended for trusted development or small operational use, not an unmodified public production deployment.

## Next milestone ideas

1. Add authenticated roles and an audit identity to management changes.
2. Add assignment, notification routing, and SLA tracking.
3. Add calibrated duplicate-evaluation fixtures from anonymized campus examples.
4. Add browser automation and viewport regression tests.
