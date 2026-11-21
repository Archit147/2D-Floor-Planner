"""Geometry analysis REST endpoints."""

from flask import Blueprint, jsonify, request

from backend.models.projects import validate_document
from backend.services.room_detection import detect_rooms
from backend.services.auto_layout import generate_layout
from backend.services.validator import validate_plan
from backend.services.wall_offset import offset_polyline

geometry_api = Blueprint("geometry_api", __name__)


@geometry_api.post("/api/geometry/rooms")
def rooms():
    try:
        document = validate_document(request.get_json(silent=True))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    return jsonify({"rooms": detect_rooms(document["entities"])})


@geometry_api.post("/api/geometry/validate")
def validate():
    try:
        document = validate_document(request.get_json(silent=True))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    return jsonify({"issues": validate_plan(document["entities"])})


@geometry_api.post("/api/geometry/offset")
def offset():
    data = request.get_json(silent=True) or {}
    try:
        vertices = data.get("points", [])
        distance = float(data.get("distance", 0))
        if not isinstance(vertices, list) or not all(isinstance(point, list) and len(point) == 2 for point in vertices):
            raise ValueError("points must be an array of [x, y] coordinates")
        if not -100000 <= distance <= 100000:
            raise ValueError("distance is outside the supported range")
        return jsonify(offset_polyline([(float(point[0]), float(point[1])) for point in vertices], distance))
    except (TypeError, ValueError) as error:
        return jsonify({"error": str(error)}), 400


@geometry_api.post("/api/geometry/auto-layout")
def auto_layout():
    data = request.get_json(silent=True) or {}
    try:
        result = generate_layout(data.get("rooms", []), float(data.get("gap", 0)), float(data.get("thickness", 12)))
    except (TypeError, ValueError) as error:
        return jsonify({"error": str(error)}), 400
    return jsonify(result)


@geometry_api.post("/api/geometry/dimensions")
def dimensions():
    try:
        document = validate_document(request.get_json(silent=True))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    result = []
    for entity in document["entities"]:
        if entity["type"] != "wall":
            continue
        for start, end in zip(entity["points"], entity["points"][1:]):
            length = ((end["x"] - start["x"]) ** 2 + (end["y"] - start["y"]) ** 2) ** 0.5
            result.append({"points": [start, end], "length": length / 100, "unit": "m"})
    return jsonify({"dimensions": result})