"""Structural checks for wall connectivity and door/window placement."""

from __future__ import annotations

import math
from typing import Any

from backend.algorithms.geometry import line_intersection, point_segment_distance


def _segments(entities: list[dict[str, Any]]) -> list[tuple[str, tuple[float, float], tuple[float, float], float]]:
    result = []
    for entity in entities:
        if entity.get("type") != "wall":
            continue
        points = entity.get("points", [])
        thickness = float(entity.get("thickness", 0))
        result.extend((entity.get("id", "wall"), (first["x"], first["y"]), (second["x"], second["y"]), thickness) for first, second in zip(points, points[1:]))
    return result


def validate_plan(entities: list[dict[str, Any]], tolerance: float = 2.0) -> list[dict[str, str]]:
    """Report collinear wall overlaps, unjoined nearby endpoints, and off-wall openings."""
    walls = _segments(entities)
    issues: list[dict[str, str]] = []
    blocked_codes: set[str] = set()
    for index, first in enumerate(walls):
        for second in walls[index + 1:]:
            a, b = first[1], first[2]
            c, d = second[1], second[2]
            intersection = line_intersection(a, b, c, d)
            if intersection is not None and all(math.dist(point, intersection) > tolerance for point in (a, b, c, d)):
                continue
            cross = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])
            offset = (c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])
            if abs(cross) < 1e-9 and abs(offset) < 1e-9:
                axis = 0 if abs(b[0] - a[0]) >= abs(b[1] - a[1]) else 1
                overlap = min(max(a[axis], b[axis]), max(c[axis], d[axis])) - max(min(a[axis], b[axis]), min(c[axis], d[axis]))
                if overlap > tolerance:
                    issues.append({"code": "wall_overlap", "message": f"Walls {first[0]} and {second[0]} overlap."})
    endpoints = [(wall[0], point) for wall in walls for point in wall[1:3]]
    for index, (wall_id, point) in enumerate(endpoints):
        for other_id, other in endpoints[index + 1:]:
            if wall_id != other_id and 0.1 < math.dist(point, other) < tolerance:
                issues.append({"code": "corner_gap", "message": f"Wall endpoints {wall_id} and {other_id} are separated by a small gap."})
    for opening in (entity for entity in entities if entity.get("type") in {"door", "window"}):
        points = opening.get("points", [])
        if not points:
            continue
        midpoint = ((points[0]["x"] + points[-1]["x"]) / 2, (points[0]["y"] + points[-1]["y"]) / 2)
        on_wall = any(point_segment_distance(midpoint, wall[1], wall[2]) <= max(tolerance, wall[3] / 2 + tolerance) for wall in walls)
        if not on_wall:
            issues.append({"code": "opening_off_wall", "message": f"{opening['type'].title()} {opening.get('id', '')} is not placed on a wall."})
        opening_width = math.dist(
            (points[0]["x"], points[0]["y"]),
            (points[-1]["x"], points[-1]["y"]),
        )
        if opening["type"] == "door" and opening_width < 75:
            issues.append({"code": "door_too_narrow", "message": f"Door {opening.get('id', '')} is narrower than 75 cm."})
        if opening["type"] == "window" and opening_width < 50:
            issues.append({"code": "window_too_narrow", "message": f"Window {opening.get('id', '')} is narrower than 50 cm."})
        if len(points) >= 2:
            height = float(opening.get("height", 210 if opening["type"] == "door" else 115))
            if opening["type"] == "door" and not 180 <= height <= 260:
                issues.append({"code": "door_height", "message": f"Door {opening.get('id', '')} should be 180-260 cm high."})
            if opening["type"] == "window" and not 50 <= height <= 250:
                issues.append({"code": "window_height", "message": f"Window {opening.get('id', '')} should be 50-250 cm high."})
    for furniture in (entity for entity in entities if entity.get("type") == "furniture"):
        points = furniture.get("points", [])
        if len(points) < 2:
            continue
        min_x = min(point["x"] for point in points)
        max_x = max(point["x"] for point in points)
        min_y = min(point["y"] for point in points)
        max_y = max(point["y"] for point in points)
        touches_wall = False
        for _wall_id, start, end, thickness in walls:
            clearance = thickness / 2
            expanded = (
                min_x - clearance, min_y - clearance,
                max_x + clearance, max_y + clearance,
            )
            closest_points = (
                (min_x, min_y), (min_x, max_y),
                (max_x, min_y), (max_x, max_y),
            )
            for point in closest_points:
                if point_segment_distance(point, start, end) <= clearance:
                    touches_wall = True
                    break
            if touches_wall:
                break
            left, bottom, right, top = expanded
            for edge_start, edge_end in (
                ((left, bottom), (right, bottom)),
                ((right, bottom), (right, top)),
                ((right, top), (left, top)),
                ((left, top), (left, bottom)),
            ):
                if line_intersection(start, end, edge_start, edge_end) is not None:
                    touches_wall = True
                    break
            if touches_wall:
                break
        if touches_wall:
            issues.append({
                "code": "furniture_touching_wall",
                "message": f"Furniture {furniture.get('id', '')} touches or intersects a wall.",
            })
    furniture_entities = [entity for entity in entities if entity.get("type") in {"furniture", "rectangle"}]
    furniture_bounds = []
    for entity in furniture_entities:
        points = entity.get("points", [])
        if len(points) < 2:
            continue
        furniture_bounds.append({
            "id": entity.get("id", "object"),
            "left": min(point["x"] for point in points),
            "right": max(point["x"] for point in points),
            "bottom": min(point["y"] for point in points),
            "top": max(point["y"] for point in points),
        })
    for index, first in enumerate(furniture_bounds):
        for second in furniture_bounds[index + 1:]:
            overlap_x = min(first["right"], second["right"]) - max(first["left"], second["left"])
            overlap_y = min(first["top"], second["top"]) - max(first["bottom"], second["bottom"])
            if overlap_x > tolerance and overlap_y > tolerance:
                issues.append({
                    "code": "furniture_overlap",
                    "message": f"Objects {first['id']} and {second['id']} overlap.",
                })
    return issues