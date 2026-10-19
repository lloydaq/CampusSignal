# CampusSignal

CampusSignal is a reproducible first vertical slice for campus incident reporting and management. It provides a browser form, persistent SQLite storage, backend validation, explainable priority scoring, deterministic duplicate evidence, and resolution tracking.

## Requirements

- Python 3.14.4 (pinned in `.python-version`)
- Docker 28+ (optional, required for the container workflow)

The repository includes a direct dependency manifest (`requirements.txt`) and a resolved lockfile (`requirements.lock`). The lockfile contains exact versions for the complete installed dependency set and is the file used by the Docker image. Uvicorn’s optional server extras are intentionally not installed; the application does not need them and this keeps the locked environment portable across the pinned runtime’s supported platforms.

## Local setup and run

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.lock
cp .env.example .env
uvicorn app.main:app --reload
```

`DATABASE_PATH` defaults to `data/campussignal.db`. The parent directory is created at startup when needed. To use another location, set it in the environment before starting the app:

```bash
DATABASE_PATH=data/local.db uvicorn app.main:app --reload
```

Open <http://127.0.0.1:8000>. SQLite creates the database and tables on first startup. No credentials or external services are required.

## Test

The single documented test command is:

```bash
python -m pytest -q
```

The tests cover persistence, validation, priority-factor output, duplicate evidence, lifecycle history, frontend/API contract markers, and the required resolution note. The frontend uses the existing API directly; no mock incident data is bundled.

## Docker

Build the image from the repository root:

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

The container runs as the unprivileged `campussignal` user and writes SQLite to `/app/data/campussignal.db`. The mounted volume must be writable by the container user. Named Docker volumes meet this requirement automatically. For a bind mount on Linux, prepare a writable directory for UID `10001`:

```bash
mkdir -p data-container
sudo chown 10001:10001 data-container
docker run --rm --name campussignal \
  -p 8000:8000 \
  -v "$(pwd)/data-container:/app/data" \
  campussignal
```

The default container configuration is equivalent to:

```text
DATABASE_PATH=/app/data/campussignal.db
```

You can override it with `-e DATABASE_PATH=/app/data/other.db`, but keep the database inside a writable mounted directory. Check readiness with:

```bash
curl http://127.0.0.1:8000/health
```

Expected response:

```json
{"status":"ok"}
```

The image excludes Git metadata, local databases, tests, caches, editor configuration, environment files, and logs through `.dockerignore`.

### Container smoke test

Use an isolated named volume so the developer database is never touched:

```bash
docker volume create campussignal-smoke-data
docker run -d --name campussignal-smoke \
  -p 18000:8000 \
  -v campussignal-smoke-data:/app/data \
  campussignal
curl http://127.0.0.1:18000/health
docker rm -f campussignal-smoke
docker run -d --name campussignal-smoke \
  -p 18000:8000 \
  -v campussignal-smoke-data:/app/data \
  campussignal
curl http://127.0.0.1:18000/api/incidents
docker rm -f campussignal-smoke
docker volume rm campussignal-smoke-data
```

## Current scoring and duplicate rules

Priority is capped at 100 and is the sum of severity (12 points per level), a category baseline, and up to 15 points for urgency words. Each factor is returned by the API and shown in the interface.

Duplicate candidates are considered within 24 hours. The score combines meaningful-word Jaccard overlap (50%), same category (20%), same location (20%), and recency (10%). A score of at least 0.65 is reported with each signal and its explanation. This is a review aid, not an automatic merge.

## Next 24-hour increments

1. Add authenticated roles and an audit log for every management change.
2. Add configurable campus locations and notification routing.
3. Add a queue view with filters, assignment, SLA timers, and accessibility review.
4. Evaluate duplicate thresholds against anonymized campus examples and add regression fixtures.

## Deployment limitations

This is a single-process SQLite deployment intended for a trusted development or small operational environment. It does not yet provide authentication, authorization, HTTPS termination, backups, external log aggregation, rate limiting, or multi-worker database coordination. Add those controls before exposing it to an untrusted public network.
