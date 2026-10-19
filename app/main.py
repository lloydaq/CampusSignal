import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .database import get_connection, init_db
from .schemas import IncidentCreate, IncidentUpdate
from .service import duplicate_match, dumps, loads, now_iso, priority_for


app = FastAPI(title="CampusSignal", version="0.1.0")
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.on_event("startup")
def startup() -> None:
    init_db()


def serialize(row):
    item = dict(row)
    item["priority_factors"] = loads(item["priority_factors"])
    item["duplicate_evidence"] = loads(item["duplicate_evidence"])
    return item


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/incidents")
def list_incidents():
    with get_connection() as connection:
        rows = connection.execute("SELECT * FROM incidents ORDER BY created_at DESC").fetchall()
    return [serialize(row) for row in rows]


@app.post("/api/incidents", status_code=201)
def create_incident(payload: IncidentCreate):
    created_at = now_iso()
    score, factors = priority_for(payload.title, payload.description, payload.category, payload.severity)
    candidate = {**payload.model_dump(), "created_at": created_at}
    best = None
    with get_connection() as connection:
        existing = connection.execute("SELECT * FROM incidents ORDER BY created_at DESC").fetchall()
        for row in existing:
            match_score, evidence = duplicate_match(candidate, dict(row))
            if match_score >= 0.65 and (best is None or match_score > best[1]):
                best = (dict(row), match_score, evidence)
        duplicate_of = best[0]["id"] if best else None
        duplicate_score = best[1] if best else None
        duplicate_evidence = best[2] if best else []
        cursor = connection.execute(
            """INSERT INTO incidents
            (title, description, category, location, reporter_name, severity, priority_score,
             priority_factors, status, duplicate_of, duplicate_score, duplicate_evidence, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reported', ?, ?, ?, ?, ?)""",
            (payload.title, payload.description, payload.category, payload.location, payload.reporter_name,
             payload.severity, score, dumps(factors), duplicate_of, duplicate_score, dumps(duplicate_evidence), created_at, created_at),
        )
        row = connection.execute("SELECT * FROM incidents WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return serialize(row)


@app.patch("/api/incidents/{incident_id}")
def update_incident(incident_id: int, payload: IncidentUpdate):
    if payload.status == "resolved" and not (payload.resolution_note or "").strip():
        raise HTTPException(status_code=422, detail="resolution_note is required when resolving an incident")
    with get_connection() as connection:
        current = connection.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
        if current is None:
            raise HTTPException(status_code=404, detail="Incident not found")
        updated_at = now_iso()
        connection.execute(
            "UPDATE incidents SET status = ?, resolution_note = ?, updated_at = ? WHERE id = ?",
            (payload.status, payload.resolution_note, updated_at, incident_id),
        )
        row = connection.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
    return serialize(row)
