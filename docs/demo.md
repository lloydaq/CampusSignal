# CampusSignal three-minute demonstration

This walkthrough uses the real browser interface and the existing API. It does not require seed data or mock records. Start with an empty database for a clean demonstration, or use the normal database if you want to show existing history.

## Before the demo

From the repository root:

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.lock
DATABASE_PATH=data/demo.db uvicorn app.main:app --reload
```

Open <http://127.0.0.1:8000>. The `data/demo.db` file is a development-only demonstration database. Remove it after the demo if you do not want to keep the sample records:

```bash
rm data/demo.db
```

On Windows PowerShell, use `$env:DATABASE_PATH="data/demo.db"` before starting the server and `Remove-Item data/demo.db` afterward.

## Suggested sequence

### 1. Frame the problem — 20 seconds

“Campus reports can be scattered, repetitive, and difficult to prioritize. CampusSignal gives the operations team one place to capture the original report, understand why it is urgent, see possible duplicates, and track the evidence through resolution.”

### 2. Open the dashboard — 20 seconds

Point out the live queue and the four metrics:

- Needs attention
- Total reports
- High priority
- Resolved

Explain that these values come from `GET /api/incidents`; they are not demo counters. On a new database they correctly start at zero.

### 3. Submit the first report — 30 seconds

Use the form with:

- Title: `Water leak near science lab`
- Your name: `Demo Reporter`
- Description: `Water is pooling outside the west entrance and the floor is becoming slippery.`
- Category: `facilities`
- Location: `Science Building west entrance`
- Severity: `4 · High`

Submit the form. Show the success message, the new queue row, the updated metrics, and the selected incident detail. Point out the score and its factor breakdown.

### 4. Submit a related report — 30 seconds

Submit a second report:

- Title: `Slip hazard from lab entrance leak`
- Your name: `Second Demo Reporter`
- Description: `The water leak at the west entrance is still pooling on the floor and needs attention.`
- Category: `facilities`
- Location: `Science Building west entrance`
- Severity: `3 · Significant`

Select it in the queue. In the detail panel, show the duplicate-review candidate, heuristic score, matching signals, conflicting signals, and human-review explanation. Emphasize that both reports remain separate and no automatic merge occurred.

### 5. Explain prioritization — 20 seconds

Use the Priority intelligence section to show the real severity, category baseline, and urgency-language factors. Explain that the score is deterministic and explainable, not a probability or an AI-generated verdict.

### 6. Walk through Signal Trail — 30 seconds

Use the workflow control on the selected report and save these transitions one at a time:

```text
reported → triaged → in_progress
```

After each confirmed save, point out the current stage and the timestamped persisted history. The UI only offers transitions accepted by the backend.

### 7. Resolve the incident — 25 seconds

Choose `resolved`, enter:

```text
Facilities cleared the water, repaired the leak, and verified the entrance is safe.
```

Save the update, then move it to `closed`. Show the resolution note and the final Signal Trail. A resolution without a note is intentionally rejected by the API.

### 8. Close with the value — 15 seconds

“CampusSignal preserves every original report, makes duplicate and priority reasoning visible, and records the actual status history and resolution evidence. That gives the team a traceable decision path instead of an opaque inbox.”

## Optional API verification

The generated interactive API documentation is available at <http://127.0.0.1:8000/docs>. The health check is:

```bash
curl http://127.0.0.1:8000/health
```

Expected response:

```json
{"status":"ok"}
```

For a reproducible non-browser check, the repository test suite covers validation, persistence, duplicate evidence, lifecycle rules, resolution notes, rollback behavior, and frontend/API contract markers:

```bash
python -m pytest -q
```

## Demo cautions

- Do not describe heuristic duplicate scores as probabilities.
- Do not claim the second report was merged; it was only flagged for human review.
- Do not quote metric values unless they are visible in the current database.
- If the server is using existing records, say so before beginning.
