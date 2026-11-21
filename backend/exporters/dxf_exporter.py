"""DXF serialization using ezdxf entities and layers."""

from __future__ import annotations

from io import StringIO
from typing import Any


def export_dxf(document: dict[str, Any]) -> bytes:
    """Create a DXF document with wall and general drawing layers."""
    import ezdxf

    drawing = ezdxf.new("R2010")
    model = drawing.modelspace()
    drawing.layers.new("Walls", dxfattribs={"color": 7, "lineweight": 35})
    drawing.layers.new("Drawing", dxfattribs={"color": 4})
    for entity in document["entities"]:
        points = entity.get("points", [])
        if not points:
            continue
        layer = "Walls" if entity["type"] == "wall" else "Drawing"
        attrs = {"layer": layer}
        if entity["type"] == "circle" and len(points) > 1:
            radius = ((points[1]["x"] - points[0]["x"]) ** 2 + (points[1]["y"] - points[0]["y"]) ** 2) ** 0.5
            model.add_circle((points[0]["x"], points[0]["y"]), radius, dxfattribs=attrs)
        elif entity["type"] == "rectangle" and len(points) > 1:
            first, second = points
            corners = [(first["x"], first["y"]), (second["x"], first["y"]), (second["x"], second["y"]), (first["x"], second["y"])]
            model.add_lwpolyline(corners, close=True, dxfattribs=attrs)
        elif entity["type"] == "text":
            model.add_text(entity.get("label", "Text"), dxfattribs={**attrs, "insert": (points[0]["x"], points[0]["y"], 0), "height": 18})
        elif len(points) > 1:
            model.add_lwpolyline([(point["x"], point["y"]) for point in points], dxfattribs=attrs)
    stream = StringIO()
    drawing.write(stream)
    return stream.getvalue().encode("utf-8")