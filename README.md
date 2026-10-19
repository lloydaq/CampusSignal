# CampusSignal

CampusSignal is a reproducible first vertical slice for campus incident reporting and management. It provides a browser form, persistent SQLite storage, backend validation, explainable priority scoring, deterministic duplicate evidence, and resolution tracking.

## Requirements

- Python 3.14.4 (pinned in `.python-version`)
- Docker (optional)

The repository includes a direct dependency manifest (`requirements.txt`) and a resolved lockfile (`requirements.lock`).

## Local setup and run

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.lock
cp .env.example .env
uvicorn app.main:app --reload
```

Open <http://127.0.0.1:8000>. `DATABASE_PATH` defaults to `data/campussignal.db`; SQLite creates it on first startup.

## Test

The single documented test command is:

```bash
python -m pytest -q
```

The tests cover persistence, validation, priority-factor output, duplicate evidence, and the required resolution note.

## Docker

```bash
docker build -t campussignal .
docker run --rm -p 8000:8000 -v "$(pwd)/data:/app/data" campussignal
```

Then open <http://127.0.0.1:8000>. No external services or secrets are required. `.env.example` documents the supported configuration.

## Current scoring and duplicate rules

Priority is capped at 100 and is the sum of severity (12 points per level), a category baseline, and up to 15 points for urgency words. Each factor is returned by the API and shown in the interface.

Duplicate candidates are considered within 24 hours. The score combines meaningful-word Jaccard overlap (50%), same category (20%), same location (20%), and recency (10%). A score of at least 0.65 is reported with each signal and its explanation. This is a review aid, not an automatic merge.

## Next 24-hour increments

1. Add authenticated roles and an audit log for every management change.
2. Add configurable campus locations and notification routing.
3. Add a queue view with filters, assignment, SLA timers, and accessibility review.
4. Evaluate duplicate thresholds against anonymized campus examples and add regression fixtures.
