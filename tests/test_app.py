import os
from pathlib import Path

os.environ["DATABASE_PATH"] = str(Path(__file__).parent / "test.db")

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import init_db


@pytest.fixture(autouse=True)
def clean_db():
    database = Path(os.environ["DATABASE_PATH"])
    if database.exists(): database.unlink()
    init_db()
    yield
    if database.exists(): database.unlink()


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def report(**overrides):
    payload = {"title": "Broken light in library", "description": "The light above table seven is flickering and needs repair.", "category": "facilities", "location": "Main Library", "reporter_name": "Asha Student", "severity": 3}
    payload.update(overrides)
    return payload


def test_submit_and_list_persisted_incident(client):
    assert client.get("/").status_code == 200
    assert client.get("/health").json() == {"status": "ok"}
    response = client.post("/api/incidents", json=report())
    assert response.status_code == 201
    created = response.json()
    assert created["priority_score"] == 46
    assert any(f["factor"] == "severity" for f in created["priority_factors"])
    assert client.get("/api/incidents").json()[0]["title"] == "Broken light in library"


def test_validation_rejects_short_description_and_unknown_category(client):
    response = client.post("/api/incidents", json=report(description="short", category="not-real"))
    assert response.status_code == 422


def test_duplicate_result_explains_matching_signals(client):
    client.post("/api/incidents", json=report())
    response = client.post("/api/incidents", json=report(title="Broken light in library again"))
    assert response.status_code == 201
    body = response.json()
    assert body["duplicate_of"] == 1
    assert {e["signal"] for e in body["duplicate_evidence"]} == {"text_overlap", "same_category", "same_location", "within_24_hours"}


def test_resolving_requires_note_and_persists_resolution(client):
    incident_id = client.post("/api/incidents", json=report()).json()["id"]
    assert client.patch(f"/api/incidents/{incident_id}", json={"status": "resolved"}).status_code == 422
    response = client.patch(f"/api/incidents/{incident_id}", json={"status": "resolved", "resolution_note": "Replaced the bulb and tested the circuit."})
    assert response.status_code == 200
    assert response.json()["status"] == "resolved"
    assert client.get("/api/incidents").json()[0]["resolution_note"].startswith("Replaced")
