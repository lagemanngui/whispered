from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app import paths

_SCHEMA = """
CREATE TABLE IF NOT EXISTS transcripts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    text TEXT NOT NULL,
    audio_path TEXT,
    model TEXT,
    language TEXT,
    task TEXT,
    detected_language TEXT,
    segments_json TEXT,
    audio_duration_sec REAL,
    audio_size_bytes INTEGER,
    transcribe_duration_ms INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transcripts_updated
    ON transcripts(updated_at DESC);
"""

_MIGRATIONS = (
    ("audio_duration_sec", "REAL"),
    ("audio_size_bytes", "INTEGER"),
    ("transcribe_duration_ms", "INTEGER"),
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db_path() -> Path:
    return paths.user_data_dir() / "history.db"


def _connect() -> sqlite3.Connection:
    db = _db_path()
    db.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    existing = {
        row[1] for row in conn.execute("PRAGMA table_info(transcripts)").fetchall()
    }
    for column, col_type in _MIGRATIONS:
        if column not in existing:
            conn.execute(f"ALTER TABLE transcripts ADD COLUMN {column} {col_type}")


def init_db() -> None:
    with _connect() as conn:
        conn.executescript(_SCHEMA)
        _migrate(conn)
        conn.commit()


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    segments = None
    if row["segments_json"]:
        try:
            segments = json.loads(row["segments_json"])
        except json.JSONDecodeError:
            segments = None
    return {
        "id": row["id"],
        "title": row["title"],
        "text": row["text"],
        "audio_path": row["audio_path"],
        "model": row["model"],
        "language": row["language"],
        "task": row["task"],
        "detected_language": row["detected_language"],
        "segments": segments,
        "audio_duration_sec": row["audio_duration_sec"],
        "audio_size_bytes": row["audio_size_bytes"],
        "transcribe_duration_ms": row["transcribe_duration_ms"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def list_transcripts() -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM transcripts ORDER BY updated_at DESC"
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_transcript(transcript_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM transcripts WHERE id = ?",
            (transcript_id,),
        ).fetchone()
    return _row_to_dict(row) if row else None


def create_transcript(
    *,
    title: str,
    text: str,
    audio_path: str | None = None,
    model: str | None = None,
    language: str | None = None,
    task: str | None = None,
    detected_language: str | None = None,
    segments: list[dict[str, Any]] | None = None,
    audio_duration_sec: float | None = None,
    audio_size_bytes: int | None = None,
    transcribe_duration_ms: int | None = None,
) -> dict[str, Any]:
    transcript_id = str(uuid.uuid4())
    now = _now_iso()
    segments_json = json.dumps(segments) if segments else None

    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO transcripts (
                id, title, text, audio_path, model, language, task,
                detected_language, segments_json, audio_duration_sec,
                audio_size_bytes, transcribe_duration_ms, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                transcript_id,
                title,
                text,
                audio_path,
                model,
                language,
                task,
                detected_language,
                segments_json,
                audio_duration_sec,
                audio_size_bytes,
                transcribe_duration_ms,
                now,
                now,
            ),
        )
        conn.commit()

    record = get_transcript(transcript_id)
    assert record is not None
    return record


def update_transcript(
    transcript_id: str,
    *,
    title: str | None = None,
    text: str | None = None,
    audio_path: str | None = None,
    model: str | None = None,
    language: str | None = None,
    task: str | None = None,
    detected_language: str | None = None,
    segments: list[dict[str, Any]] | None = None,
    clear_segments: bool = False,
    audio_duration_sec: float | None = None,
    audio_size_bytes: int | None = None,
    transcribe_duration_ms: int | None = None,
) -> dict[str, Any] | None:
    existing = get_transcript(transcript_id)
    if existing is None:
        return None

    fields: dict[str, Any] = {
        "title": title if title is not None else existing["title"],
        "text": text if text is not None else existing["text"],
        "audio_path": audio_path if audio_path is not None else existing["audio_path"],
        "model": model if model is not None else existing["model"],
        "language": language if language is not None else existing["language"],
        "task": task if task is not None else existing["task"],
        "detected_language": (
            detected_language
            if detected_language is not None
            else existing["detected_language"]
        ),
        "audio_duration_sec": (
            audio_duration_sec
            if audio_duration_sec is not None
            else existing["audio_duration_sec"]
        ),
        "audio_size_bytes": (
            audio_size_bytes
            if audio_size_bytes is not None
            else existing["audio_size_bytes"]
        ),
        "transcribe_duration_ms": (
            transcribe_duration_ms
            if transcribe_duration_ms is not None
            else existing["transcribe_duration_ms"]
        ),
        "updated_at": _now_iso(),
    }

    if segments is not None:
        fields["segments_json"] = json.dumps(segments)
    elif clear_segments:
        fields["segments_json"] = None
    else:
        fields["segments_json"] = (
            json.dumps(existing["segments"]) if existing.get("segments") else None
        )

    with _connect() as conn:
        conn.execute(
            """
            UPDATE transcripts SET
                title = ?, text = ?, audio_path = ?, model = ?, language = ?,
                task = ?, detected_language = ?, segments_json = ?,
                audio_duration_sec = ?, audio_size_bytes = ?,
                transcribe_duration_ms = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                fields["title"],
                fields["text"],
                fields["audio_path"],
                fields["model"],
                fields["language"],
                fields["task"],
                fields["detected_language"],
                fields["segments_json"],
                fields["audio_duration_sec"],
                fields["audio_size_bytes"],
                fields["transcribe_duration_ms"],
                fields["updated_at"],
                transcript_id,
            ),
        )
        conn.commit()

    return get_transcript(transcript_id)


def delete_transcript(transcript_id: str) -> bool:
    with _connect() as conn:
        cur = conn.execute(
            "DELETE FROM transcripts WHERE id = ?",
            (transcript_id,),
        )
        conn.commit()
        return cur.rowcount > 0
