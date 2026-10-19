import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path


DATABASE_PATH = os.getenv("DATABASE_PATH", "data/campussignal.db")


def _connection() -> sqlite3.Connection:
    path = Path(DATABASE_PATH)
    if path != Path(":memory:"):
        path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


@contextmanager
def get_connection():
    connection = _connection()
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_db() -> None:
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS incidents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                category TEXT NOT NULL,
                location TEXT NOT NULL,
                reporter_name TEXT NOT NULL,
                severity INTEGER NOT NULL,
                priority_score INTEGER NOT NULL,
                priority_factors TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'reported',
                resolution_note TEXT,
                duplicate_of INTEGER REFERENCES incidents(id),
                duplicate_score REAL,
                duplicate_evidence TEXT NOT NULL DEFAULT '[]',
                duplicate_candidates TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS incident_status_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                incident_id INTEGER NOT NULL REFERENCES incidents(id),
                from_status TEXT,
                to_status TEXT NOT NULL,
                note TEXT,
                changed_at TEXT NOT NULL
            );
            """
        )
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(incidents)")}
        if "duplicate_candidates" not in columns:
            connection.execute("ALTER TABLE incidents ADD COLUMN duplicate_candidates TEXT NOT NULL DEFAULT '[]'")
