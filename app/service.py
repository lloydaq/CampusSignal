import json
import re
from datetime import datetime, timedelta, timezone


URGENCY_WORDS = {"urgent", "danger", "dangerous", "emergency", "blocked", "fire", "flood"}
CATEGORY_WEIGHTS = {"safety": 20, "wellbeing": 15, "facilities": 10, "technology": 8, "academic": 6, "other": 4}
VALID_SEVERITIES = {1, 2, 3, 4, 5}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def priority_for(title: str, description: str, category: str, severity: int) -> tuple[int, list[dict]]:
    if category not in CATEGORY_WEIGHTS:
        raise ValueError("unknown incident category")
    if severity not in VALID_SEVERITIES:
        raise ValueError("severity must be between 1 and 5")
    text = f"{title} {description}".lower()
    severity_points = severity * 12
    category_points = CATEGORY_WEIGHTS[category]
    urgency_matches = sorted({word for word in URGENCY_WORDS if re.search(rf"\b{re.escape(word)}\b", text)})
    urgency_points = min(15, len(urgency_matches) * 5)
    score = min(100, severity_points + category_points + urgency_points)
    factors = [
        {"factor": "severity", "points": severity_points, "explanation": f"Severity {severity}/5 contributes {severity_points} points."},
        {"factor": "category", "points": category_points, "explanation": f"{category.title()} incidents carry a {category_points}-point baseline."},
        {"factor": "urgency_language", "points": urgency_points, "explanation": f"Matched urgency terms: {', '.join(urgency_matches) or 'none'}."},
    ]
    return score, factors


def normalize_text(value: str) -> str:
    return " ".join(value.casefold().split())


def tokens(value: str) -> set[str]:
    return {token for token in re.findall(r"[a-z0-9]+", normalize_text(value)) if len(token) > 2}


def duplicate_match(new: dict, old: dict) -> dict:
    new_tokens = tokens(f"{new['title']} {new['description']}")
    old_tokens = tokens(f"{old['title']} {old['description']}")
    overlap = len(new_tokens & old_tokens) / max(1, len(new_tokens | old_tokens))
    same_category = new["category"] == old["category"]
    same_location = normalize_text(new["location"]) == normalize_text(old["location"])
    recent = datetime.fromisoformat(old["created_at"]) >= datetime.now(timezone.utc) - timedelta(hours=24)
    score = overlap * 0.5 + (0.2 if same_category else 0) + (0.2 if same_location else 0) + (0.1 if recent else 0)
    matching = []
    conflicting = []
    signals = [
        ("text_overlap", overlap, overlap >= 0.35, "Meaningful title/description words overlap."),
        ("same_category", same_category, same_category, "Both incidents use the same category."),
        ("same_location", same_location, same_location, "Both incidents name the same location."),
        ("within_24_hours", recent, recent, "The existing incident was reported within 24 hours."),
    ]
    for name, value, matches, explanation in signals:
        item = {"signal": name, "value": round(value, 2) if isinstance(value, float) else value, "explanation": explanation}
        (matching if matches else conflicting).append(item)
    score = round(score, 2)
    explanation = (
        f"Candidate #{old['id']} has a heuristic matching score of {score}; "
        f"{len(matching)} signal(s) match and {len(conflicting)} conflict. Human review is required."
    )
    return {
        "candidate_incident_id": old["id"],
        "score": score,
        "matching_signals": matching,
        "conflicting_signals": conflicting,
        "explanation": explanation,
    }


def dumps(value) -> str:
    return json.dumps(value, separators=(",", ":"))


def loads(value: str):
    return json.loads(value)
