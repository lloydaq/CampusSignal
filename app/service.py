import json
import re
from datetime import datetime, timedelta, timezone


URGENCY_WORDS = {"urgent", "danger", "dangerous", "emergency", "blocked", "fire", "flood"}
CATEGORY_WEIGHTS = {"safety": 20, "wellbeing": 15, "facilities": 10, "technology": 8, "academic": 6, "other": 4}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def priority_for(title: str, description: str, category: str, severity: int) -> tuple[int, list[dict]]:
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


def tokens(value: str) -> set[str]:
    return {token for token in re.findall(r"[a-z0-9]+", value.lower()) if len(token) > 2}


def duplicate_match(new: dict, old: dict) -> tuple[float, list[dict]]:
    new_tokens = tokens(f"{new['title']} {new['description']}")
    old_tokens = tokens(f"{old['title']} {old['description']}")
    overlap = len(new_tokens & old_tokens) / max(1, len(new_tokens | old_tokens))
    same_category = new["category"] == old["category"]
    same_location = new["location"].strip().lower() == old["location"].strip().lower()
    recent = datetime.fromisoformat(old["created_at"]) >= datetime.now(timezone.utc) - timedelta(hours=24)
    score = overlap * 0.5 + (0.2 if same_category else 0) + (0.2 if same_location else 0) + (0.1 if recent else 0)
    evidence = [
        {"signal": "text_overlap", "value": round(overlap, 2), "explanation": "Jaccard overlap of meaningful title/description words."},
        {"signal": "same_category", "value": same_category, "explanation": "Both incidents use the same category."},
        {"signal": "same_location", "value": same_location, "explanation": "Both incidents name the same location."},
        {"signal": "within_24_hours", "value": recent, "explanation": "The existing incident was reported within 24 hours."},
    ]
    return round(score, 2), evidence


def dumps(value) -> str:
    return json.dumps(value, separators=(",", ":"))


def loads(value: str):
    return json.loads(value)
