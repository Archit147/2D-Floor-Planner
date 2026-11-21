"""Step-by-step computer graphics Algorithm Lab endpoints."""

from __future__ import annotations

import math

from flask import Blueprint, jsonify, request

from backend.algorithms.clipping import cohen_sutherland_trace, liang_barsky_clip, sutherland_hodgman_clip
from backend.algorithms.raster import bresenham_trace, dda_line, midpoint_circle, midpoint_circle_trace, scanline_fill
from backend.algorithms.transforms import Matrix3

lab_api = Blueprint("lab_api", __name__)


def _point(data: dict, name: str, default: tuple[float, float]) -> tuple[float, float]:
    value = data.get(name, default)
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise ValueError(f"{name} must be a two-number array")
    result = float(value[0]), float(value[1])
    if not all(math.isfinite(axis) for axis in result):
        raise ValueError(f"{name} values must be finite")
    return result


@lab_api.post("/api/lab/<algorithm>")
def run_algorithm(algorithm: str):
    data = request.get_json(silent=True) or {}
    try:
        start = _point(data, "start", (2, 3))
        end = _point(data, "end", (18, 11))
        rect_values = data.get("rect", [0, 0, 20, 20])
        rect = tuple(float(value) for value in rect_values)
        if len(rect) != 4 or not all(math.isfinite(value) for value in rect):
            raise ValueError("rect must contain four finite values")
        if algorithm == "bresenham":
            result = {"steps": bresenham_trace(start, end)}
        elif algorithm == "dda":
            result = {"pixels": [{"x": x, "y": y} for x, y in dda_line(start, end)]}
        elif algorithm == "midpoint-circle":
            center = _point(data, "center", (12, 12))
            radius = int(data.get("radius", 8))
            if radius < 0 or radius > 10000:
                raise ValueError("radius must be between 0 and 10000")
            result = {
                "steps": midpoint_circle_trace(center, radius),
                "pixels": [{"x": x, "y": y} for x, y in midpoint_circle(center, radius)],
                "center": center,
                "radius": radius,
            }
        elif algorithm == "cohen-sutherland":
            result = cohen_sutherland_trace(start, end, rect)
        elif algorithm == "liang-barsky":
            segment = liang_barsky_clip(start, end, rect)
            result = {"accepted": segment is not None, "segment": segment}
        elif algorithm == "sutherland-hodgman":
            subject = [_point({"p": item}, "p", (0, 0)) for item in data.get("subject", [])]
            polygon = [_point({"p": item}, "p", (0, 0)) for item in data.get("clip", [])]
            result = {"polygon": sutherland_hodgman_clip(subject, polygon)}
        elif algorithm == "scanline":
            polygon = [_point({"p": item}, "p", (0, 0)) for item in data.get("polygon", [])]
            result = {"spans": scanline_fill(polygon)}
        elif algorithm == "matrix":
            point = _point(data, "point", (1, 1))
            tx, ty = float(data.get("tx", 0)), float(data.get("ty", 0))
            angle = math.radians(float(data.get("rotation", 0)))
            sx, sy = float(data.get("sx", 1)), float(data.get("sy", 1))
            matrix = Matrix3.translate(tx, ty).compose(Matrix3.rotate(angle)).compose(Matrix3.scale(sx, sy))
            result = {"matrix": matrix.tolist(), "point": point, "transformed": matrix.transform_point(point)}
        else:
            return jsonify({"error": "Unknown algorithm"}), 404
    except (TypeError, ValueError, OverflowError) as error:
        return jsonify({"error": str(error)}), 400
    return jsonify(result)