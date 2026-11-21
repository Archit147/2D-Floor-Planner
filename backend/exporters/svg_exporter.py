"""Manual SVG serialization for plan entities."""

from __future__ import annotations

from html import escape
from typing import Any


def export_svg(document: dict[str, Any]) -> str:
    """Serialize linework to a standalone SVG with CAD coordinates mapped to screen space."""
    entities = document["entities"]
    points = [point for entity in entities for point in entity.get("points", [])]
    min_x = min((point["x"] for point in points), default=0)
    max_x = max((point["x"] for point in points), default=1000)
    min_y = min((point["y"] for point in points), default=0)
    max_y = max((point["y"] for point in points), default=700)
    margin = 50
    width, height = max(200, max_x - min_x + margin * 2), max(160, max_y - min_y + margin * 2)

    def map_point(point: dict[str, float]) -> tuple[float, float]:
        return point["x"] - min_x + margin, max_y - point["y"] + margin

    shapes = []
    for entity in entities:
        vertices = entity.get("points", [])
        if not vertices:
            continue
        color = escape(entity.get("color", "#303936"))
        thickness = max(1, float(entity.get("thickness", 2)))
        if entity["type"] == "circle" and len(vertices) > 1:
            center, edge = map_point(vertices[0]), map_point(vertices[1])
            radius = ((vertices[1]["x"] - vertices[0]["x"]) ** 2 + (vertices[1]["y"] - vertices[0]["y"]) ** 2) ** 0.5
            shapes.append(f'<circle cx="{center[0]:.3f}" cy="{center[1]:.3f}" r="{radius:.3f}" fill="none" stroke="{color}" stroke-width="{thickness if entity["type"] == "wall" else 2}"/>')
        elif entity["type"] == "rectangle" and len(vertices) > 1:
            first, second = map_point(vertices[0]), map_point(vertices[1])
            shapes.append(f'<rect x="{min(first[0], second[0]):.3f}" y="{min(first[1], second[1]):.3f}" width="{abs(first[0] - second[0]):.3f}" height="{abs(first[1] - second[1]):.3f}" fill="none" stroke="{color}" stroke-width="2"/>')
        elif entity["type"] == "text":
            point = map_point(vertices[0])
            shapes.append(f'<text x="{point[0]:.3f}" y="{point[1]:.3f}" fill="{color}" font-family="sans-serif" font-size="18">{escape(entity.get("label", "Text"))}</text>')
        else:
            mapped = [map_point(point) for point in vertices]
            path = " ".join(("M" if index == 0 else "L") + f" {x:.3f} {y:.3f}" for index, (x, y) in enumerate(mapped))
            shapes.append(f'<path d="{path}" fill="none" stroke="{color}" stroke-width="{thickness if entity["type"] == "wall" else 2}" stroke-linecap="square" stroke-linejoin="miter"/>')
    title = escape(document.get("title", "Floor Plan"))
    body = "\n  ".join(shapes)
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" viewBox="0 0 {width:.0f} {height:.0f}"><title>{title}</title><rect width="100%" height="100%" fill="#ffffff"/>\n  {body}\n</svg>'