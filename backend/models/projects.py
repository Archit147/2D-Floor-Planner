"""SQLite persistence and validation for plan documents."""

from __future__ import annotations

import json
import math
import sqlite3
from pathlib import Path
from typing import Any

from flask import current_app

ALLOWED_TYPES = {"wall", "line", "rectangle", "circle", "polyline", "polygon", "door", "window", "furniture", "dimension", "text"}


def connect() -> sqlite3.Connection:
    """Open the application database and ensure its table exists."""
    instance_path = Path(current_app.instance_path)
    instance_path.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(instance_path / "floorplans.sqlite3")
    connection.row_factory = sqlite3.Row
    connection.execute("""CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        document TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""")
    return connection


def validate_document(payload: Any) -> dict[str, Any]:
    """Validate the public JSON document shape and finite geometry values."""
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object")
    title = payload.get("title", "Untitled plan")
    entities = payload.get("entities", [])
    if not isinstance(title, str) or not title.strip() or len(title.strip()) > 120:
        raise ValueError("title must contain 1 to 120 characters")
    if not isinstance(entities, list) or len(entities) > 10000:
        raise ValueError("entities must be an array containing at most 10000 items")
    for index, entity in enumerate(entities):
        if not isinstance(entity, dict) or entity.get("type") not in ALLOWED_TYPES:
            raise ValueError(f"entities[{index}] has an unsupported type")
        points = entity.get("points")
        if not isinstance(points, list) or len(points) < 1 or len(points) > 1000:
            raise ValueError(f"entities[{index}].points must contain 1 to 1000 points")
        for point in points:
            if not isinstance(point, dict):
                raise ValueError(f"entities[{index}] contains an invalid point")
            for axis in ("x", "y"):
                value = point.get(axis)
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or abs(value) > 1e9:
                    raise ValueError(f"entities[{index}] contains an invalid {axis} coordinate")
        for field, minimum, maximum in (("thickness", 0, 200), ("height", 1, 1000)):
            value = entity.get(field)
            if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not minimum <= value <= maximum):
                raise ValueError(f"entities[{index}].{field} must be between {minimum} and {maximum}")
        label = entity.get("label", "")
        if not isinstance(label, str) or len(label) > 200:
            raise ValueError(f"entities[{index}].label must be a string of at most 200 characters")
    clean = dict(payload)
    clean["title"] = title.strip()
    clean["entities"] = entities
    return clean


def row_to_project(row: sqlite3.Row) -> dict[str, Any]:
    """Decode one database row into the API project representation."""
    return {"id": row["id"], "title": row["title"], "document": json.loads(row["document"]), "createdAt": row["created_at"], "updatedAt": row["updated_at"]}