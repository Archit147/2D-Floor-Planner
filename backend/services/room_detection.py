"""Closed-loop extraction and measurement for connected wall segments."""

from __future__ import annotations

from typing import Any

from backend.algorithms.geometry import polygon_metrics


def _canonical_cycle(path: list[tuple[float, float]]) -> tuple[tuple[float, float], ...]:
    """Normalize rotations and reversal so the same loop is reported only once."""
    variants = []
    for sequence in (path, list(reversed(path))):
        variants.extend(tuple(sequence[index:] + sequence[:index]) for index in range(len(sequence)))
    return min(variants)


def detect_rooms(entities: list[dict[str, Any]], tolerance: float = 0.01) -> list[dict[str, Any]]:
    """Trace simple endpoint-connected wall cycles and calculate polygon measurements."""
    def key(point: dict[str, float]) -> tuple[float, float]:
        return round(round(float(point["x"]) / tolerance) * tolerance, 6), round(round(float(point["y"]) / tolerance) * tolerance, 6)

    adjacency: dict[tuple[float, float], set[tuple[float, float]]] = {}
    for entity in entities:
        points = entity.get("points", [])
        if entity.get("type") != "wall" or len(points) < 2:
            continue
        for start, end in zip(points, points[1:]):
            first, second = key(start), key(end)
            if first == second:
                continue
            adjacency.setdefault(first, set()).add(second)
            adjacency.setdefault(second, set()).add(first)

    cycles: dict[tuple[tuple[float, float], ...], list[tuple[float, float]]] = {}
    maximum_nodes = len(adjacency)
    for origin in sorted(adjacency):
        stack: list[tuple[tuple[float, float], list[tuple[float, float]]]] = [(origin, [origin])]
        while stack:
            current, path = stack.pop()
            for neighbor in adjacency.get(current, ()):
                if neighbor == origin and len(path) >= 3:
                    cycle = path[:]
                    cycles[_canonical_cycle(cycle)] = cycle
                elif neighbor > origin and neighbor not in path and len(path) < maximum_nodes:
                    stack.append((neighbor, path + [neighbor]))

    rooms = []
    for index, vertices in enumerate(cycles.values(), start=1):
        metrics = polygon_metrics(vertices)
        if metrics["area"] <= tolerance * tolerance:
            continue
        center = metrics["centroid"]
        rooms.append({"id": f"room-{index}", "vertices": [{"x": x, "y": y} for x, y in vertices], "area": metrics["area"] / 10000, "perimeter": metrics["perimeter"] / 100, "centroid": {"x": center[0], "y": center[1]} if center else None})
    return rooms