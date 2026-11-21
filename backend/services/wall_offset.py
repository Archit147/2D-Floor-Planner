"""Polyline offsetting with intersected offset edges for mitered joins."""

from __future__ import annotations

import math
from typing import Sequence

from backend.algorithms.geometry import line_intersection

Point = tuple[float, float]


def _unit_normal(start: Point, end: Point) -> Point:
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = math.hypot(dx, dy)
    if length < 1e-12:
        raise ValueError("Cannot offset a zero-length segment")
    return -dy / length, dx / length


def offset_polyline(vertices: Sequence[Point], distance: float) -> dict[str, list[Point]]:
    """Offset both sides of an open polyline and intersect adjacent offset lines at joins."""
    if len(vertices) < 2:
        raise ValueError("At least two points are required")
    normals = [_unit_normal(start, end) for start, end in zip(vertices, vertices[1:])]
    sides: dict[str, list[Point]] = {}
    for label, offset in (("left", distance), ("right", -distance)):
        shifted_segments = []
        for index, (start, end) in enumerate(zip(vertices, vertices[1:])):
            nx, ny = normals[index]
            shifted_segments.append(((start[0] + nx * offset, start[1] + ny * offset), (end[0] + nx * offset, end[1] + ny * offset)))
        result = [shifted_segments[0][0]]
        for previous, current in zip(shifted_segments, shifted_segments[1:]):
            joint = line_intersection(previous[0], previous[1], current[0], current[1], segments=False)
            result.append(joint or previous[1])
        result.append(shifted_segments[-1][1])
        sides[label] = result
    return sides