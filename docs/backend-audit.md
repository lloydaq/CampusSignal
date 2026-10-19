# CampusSignal Phase 1 Backend Audit

## API surface

- `GET /health` returns `{ "status": "ok" }`.
- `GET /api/incidents` returns incidents newest-first, including priority factors, duplicate candidates, and status history.
- `POST /api/incidents` validates and stores a report, assigns an autoincrement integer ID, calculates priority, and evaluates existing reports as duplicate candidates.
- `PATCH /api/incidents/{id}` applies a supported lifecycle transition and optionally records a resolution note.
- `GET /` serves the existing browser interface; `/static/*` serves its assets.

## Database

SQLite contains:

- `incidents`: the original report, immutable identity, priority result, duplicate-review result, current status, and latest resolution note.
- `incident_status_history`: append-only lifecycle evidence with previous status, next status, note, and timestamp.

Incident rows are not deleted or merged by any route. Each write uses the connection context manager; successful contexts commit and failed contexts explicitly roll back.

## Workflow

The supported lifecycle is:

`reported -> triaged -> in_progress -> resolved -> closed`

Repeating the current status is allowed for idempotent clients. Other transitions are rejected with `422`. Resolving requires a non-blank resolution note, and closing retains the resolution note and history.

## Duplicate review

Each new report is compared with existing reports using normalized case/whitespace and meaningful-word tokens, category, normalized location, and whether the candidate is within 24 hours. The heuristic score is:

- text overlap: 50%
- same category: 20%
- same location: 20%
- within 24 hours: 10%

The API returns every candidate evaluation with its candidate incident ID, numeric heuristic score, matching signals, conflicting signals, and a human-readable explanation. A score of at least `0.65` sets `duplicate_of` as a review suggestion only; it does not delete, merge, or automatically change workflow state. Scores are not probabilities.

## Priority

Priority is deterministic and capped at 100. It is the sum of severity points (`12 * severity`), the category baseline, and up to 15 points for recognized urgency terms. The API returns each factor and explanation. Pydantic validation rejects invalid severity and category values before scoring; the service also rejects invalid direct calls.

## Known limitations

- There is no authentication or role model yet; this phase intentionally keeps management unauthenticated.
- Duplicate candidates are heuristic and should be reviewed by a person; thresholds are not calibrated against campus data.
- There is no assignment, notification, SLA, pagination, or audit identity beyond status history.
- Legacy incidents created before status-history support can have an empty history until they are updated; the migration preserves their reports.
