"""Simple grid-based room packing for automatic rectangular plan generation."""

from __future__ import annotations

from typing import Any


def generate_layout(rooms: list[dict[str, Any]], gap: float = 0.0, thickness: float = 12.0) -> dict[str, Any]:
    """Place requested rectangular rooms in rows and emit their bounding wall segments."""
    if not rooms:
        raise ValueError("At least one room is required")
    normalized = []
    for index, room in enumerate(rooms):
        width, height = float(room.get("width", 0)), float(room.get("height", 0))
        if width <= 0 or height <= 0 or width > 100000 or height > 100000:
            raise ValueError(f"rooms[{index}] requires positive width and height")
        normalized.append({"name": str(room.get("name", f"Room {index + 1}"))[:80], "width": width, "height": height})
    row_limit = max(max(room["width"] for room in normalized), sum(room["width"] for room in normalized) ** 0.5)
    placed = []
    x = y = row_height = 0.0
    for room in normalized:
        if x and x + room["width"] > row_limit:
            x = 0
            y += row_height + gap
            row_height = 0
        placed.append({**room, "x": x, "y": y})
        x += room["width"] + gap
        row_height = max(row_height, room["height"])
    max_x = max(room["x"] + room["width"] for room in placed)
    max_y = max(room["y"] + room["height"] for room in placed)
    entities = []
    for index, room in enumerate(placed):
        left, bottom = room["x"], room["y"]
        right, top = left + room["width"], bottom + room["height"]
        for start, end in (((left, bottom), (right, bottom)), ((right, bottom), (right, top)), ((right, top), (left, top)), ((left, top), (left, bottom))):
            entities.append({"id": f"layout-wall-{index}-{len(entities)}", "type": "wall", "points": [{"x": start[0], "y": start[1]}, {"x": end[0], "y": end[1]}], "thickness": thickness, "layer": "Walls"})
        entities.append({"id": f"layout-label-{index}", "type": "text", "points": [{"x": (left + right) / 2, "y": (bottom + top) / 2}], "label": room["name"], "layer": "Text"})
    return {"title": "Auto Layout", "bounds": {"width": max_x, "height": max_y}, "rooms": placed, "entities": entities}