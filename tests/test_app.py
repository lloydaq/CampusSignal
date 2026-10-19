import os
from pathlib import Path

os.environ["DATABASE_PATH"] = str(Path(__file__).parent / "test.db")

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import get_connection, init_db


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


def test_saved_incident_is_visible_to_a_new_app_client(client):
    client.post("/api/incidents", json=report())
    with TestClient(app) as restarted_client:
        assert restarted_client.get("/api/incidents").json()[0]["id"] == 1


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
    assert body["duplicate_candidates"][0]["candidate_incident_id"] == 1
    assert body["duplicate_candidates"][0]["matching_signals"]
    assert "human review" in body["duplicate_candidates"][0]["explanation"].lower()


def test_unrelated_report_is_not_marked_duplicate_and_explains_conflicts(client):
    client.post("/api/incidents", json=report())
    response = client.post("/api/incidents", json=report(
        title="Exam portal password reset",
        description="Students cannot access the remote exam portal after password changes.",
        category="technology",
        location="North Residence",
        severity=2,
    ))
    body = response.json()
    assert body["duplicate_of"] is None
    candidate = body["duplicate_candidates"][0]
    assert candidate["candidate_incident_id"] == 1
    assert {signal["signal"] for signal in candidate["conflicting_signals"]} >= {"same_category", "same_location"}


def test_resolving_requires_note_and_persists_resolution(client):
    incident_id = client.post("/api/incidents", json=report()).json()["id"]
    assert client.patch(f"/api/incidents/{incident_id}", json={"status": "resolved"}).status_code == 422
    assert client.patch(f"/api/incidents/{incident_id}", json={"status": "triaged"}).status_code == 200
    assert client.patch(f"/api/incidents/{incident_id}", json={"status": "in_progress"}).status_code == 200
    response = client.patch(f"/api/incidents/{incident_id}", json={"status": "resolved", "resolution_note": "Replaced the bulb and tested the circuit."})
    assert response.status_code == 200
    assert response.json()["status"] == "resolved"
    assert [entry["to_status"] for entry in response.json()["status_history"]] == ["reported", "triaged", "in_progress", "resolved"]
    assert response.json()["status_history"][-1]["note"].startswith("Replaced")
    closed = client.patch(f"/api/incidents/{incident_id}", json={"status": "closed"})
    assert closed.status_code == 200
    assert closed.json()["resolution_note"].startswith("Replaced")
    assert client.get("/api/incidents").json()[0]["resolution_note"].startswith("Replaced")


def test_invalid_status_transition_is_rejected_without_mutation(client):
    incident_id = client.post("/api/incidents", json=report()).json()["id"]
    response = client.patch(f"/api/incidents/{incident_id}", json={"status": "closed"})
    assert response.status_code == 422
    current = client.get("/api/incidents").json()[0]
    assert current["status"] == "reported"
    assert [entry["to_status"] for entry in current["status_history"]] == ["reported"]


def test_priority_is_deterministic_and_direct_service_rejects_invalid_input(client):
    first = client.post("/api/incidents", json=report(severity=5, title="Urgent fire danger in lab")).json()
    second = client.post("/api/incidents", json=report(severity=5, title="Different urgent fire danger in lab")).json()
    assert first["priority_score"] == second["priority_score"]
    assert sum(factor["points"] for factor in first["priority_factors"]) == first["priority_score"]
    from app.service import priority_for
    with pytest.raises(ValueError):
        priority_for("title", "description", "unknown", 3)
    with pytest.raises(ValueError):
        priority_for("title", "description", "facilities", 0)


def test_database_context_rolls_back_failed_transaction():
    with pytest.raises(RuntimeError):
        with get_connection() as connection:
            connection.execute("CREATE TABLE transaction_probe (id INTEGER)")
            connection.execute("INSERT INTO transaction_probe VALUES (1)")
            raise RuntimeError("simulated failure")
    with get_connection() as connection:
        assert connection.execute("SELECT COUNT(*) FROM transaction_probe").fetchone()[0] == 0


def test_frontend_contract_contains_api_states_and_safe_rendering(client):
    page = client.get("/").text
    script = client.get("/static/app.js").text
    assert 'id="metric-total"' in page
    assert 'id="search"' in page
    assert "requestJson('/api/incidents'" in script
    assert "requestJson(`/api/incidents/${incident.id}`" in script
    assert "Loading incidents" in script
    assert "Could not load incidents" in script
    assert "Submitting…" in script
    assert "innerHTML" not in script
