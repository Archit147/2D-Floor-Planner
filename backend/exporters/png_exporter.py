"""Pillow PNG export with manually plotted Bresenham and midpoint pixels."""

from __future__ import annotations

from io import BytesIO
from typing import Any

from PIL import Image

from backend.algorithms.raster import bresenham_line, midpoint_circle, scanline_fill


def export_png(document: dict[str, Any], width: int = 1600, height: int = 1200) -> bytes:
    """Render linework into a fitted RGBA bitmap using custom pixel algorithms."""
    image = Image.new("RGBA", (width, height), "#ffffff")
    entities = document["entities"]
    source = [point for entity in entities for point in entity.get("points", [])]
    min_x = min((point["x"] for point in source), default=0)
    max_x = max((point["x"] for point in source), default=1000)
    min_y = min((point["y"] for point in source), default=0)
    max_y = max((point["y"] for point in source), default=700)
    margin = 50
    scale = min((width - 2 * margin) / max(1, max_x - min_x), (height - 2 * margin) / max(1, max_y - min_y))
    offset_x = (width - (max_x - min_x) * scale) / 2
    offset_y = (height - (max_y - min_y) * scale) / 2

    def project(point: dict[str, float]) -> tuple[int, int]:
        return round(offset_x + (point["x"] - min_x) * scale), round(height - offset_y - (point["y"] - min_y) * scale)

    def put_pixel(x: int, y: int, color: tuple[int, int, int, int], radius: int = 0) -> None:
        for offset_y_pixel in range(-radius, radius + 1):
            for offset_x_pixel in range(-radius, radius + 1):
                if offset_x_pixel * offset_x_pixel + offset_y_pixel * offset_y_pixel <= radius * radius + 1:
                    px, py = x + offset_x_pixel, y + offset_y_pixel
                    if 0 <= px < width and 0 <= py < height:
                        image.putpixel((px, py), color)

    for entity in entities:
        points = entity.get("points", [])
        if not points:
            continue
        screen = [project(point) for point in points]
        color = (45, 55, 51, 255)
        radius = max(0, round(float(entity.get("thickness", 2)) * scale / 2)) if entity["type"] == "wall" else 0
        if entity["type"] == "circle" and len(screen) > 1:
            circle_radius = round(((screen[1][0] - screen[0][0]) ** 2 + (screen[1][1] - screen[0][1]) ** 2) ** 0.5)
            for x, y in midpoint_circle(screen[0], circle_radius):
                put_pixel(x, y, color)
        else:
            segments = list(zip(screen, screen[1:]))
            if entity["type"] == "rectangle" and len(screen) > 1:
                first, second = screen[:2]
                corners = [first, (second[0], first[1]), second, (first[0], second[1]), first]
                segments = list(zip(corners, corners[1:]))
            for first, second in segments:
                for x, y in bresenham_line(first, second):
                    put_pixel(x, y, color, radius)
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()