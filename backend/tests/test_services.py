import math

from backend.services.auto_layout import generate_layout
from backend.services.room_detection import detect_rooms
from backend.services.validator import validate_plan
from backend.services.wall_offset import offset_polyline


def test_room_detection_reports_square_loop_metrics():
    walls = [
        {"type": "wall", "points": [{"x": 0, "y": 0}, {"x": 400, "y": 0}]},
        {"type": "wall", "points": [{"x": 400, "y": 0}, {"x": 400, "y": 300}]},
        {"type": "wall", "points": [{"x": 400, "y": 300}, {"x": 0, "y": 300}]},
        {"type": "wall", "points": [{"x": 0, "y": 300}, {"x": 0, "y": 0}]},
    ]
    rooms = detect_rooms(walls)
    assert len(rooms) == 1
    assert math.isclose(rooms[0]["area"], 12)
    assert math.isclose(rooms[0]["perimeter"], 14)
    assert rooms[0]["centroid"] == {"x": 200, "y": 150}


def test_wall_offset_uses_mitered_join():
    result = offset_polyline([(0, 0), (10, 0), (10, 10)], 1)
    assert result["left"] == [(0, 1), (9, 1), (9, 10)]
    assert result["right"] == [(0, -1), (11, -1), (11, 10)]


def test_auto_layout_generates_wall_edges_and_rejects_invalid_room():
    result = generate_layout([{"name": "Bedroom", "width": 400, "height": 300}, {"name": "Bath", "width": 180, "height": 160}], gap=20)
    assert result["bounds"] == {"width": 400, "height": 480}
    assert len(result["entities"]) == 10
    try:
        generate_layout([{"width": -1, "height": 20}])
    except ValueError:
        pass
    else:
        raise AssertionError("negative room dimensions should be rejected")


def test_validator_reports_gap_overlap_and_misplaced_opening():
    entities = [
        {"id": "w1", "type": "wall", "points": [{"x": 0, "y": 0}, {"x": 100, "y": 0}]},
        {"id": "w2", "type": "wall", "points": [{"x": 101, "y": 0}, {"x": 200, "y": 0}]},
        {"id": "w3", "type": "wall", "points": [{"x": 50, "y": 0}, {"x": 150, "y": 0}]},
        {"id": "d1", "type": "door", "points": [{"x": 20, "y": 80}, {"x": 60, "y": 80}]},
    ]
    codes = {issue["code"] for issue in validate_plan(entities)}
    assert {"corner_gap", "wall_overlap", "opening_off_wall"} <= codes


def test_validator_reports_furniture_touching_wall():
    entities = [
        {"id": "w1", "type": "wall", "thickness": 14, "points": [{"x": 0, "y": 0}, {"x": 100, "y": 0}]},
        {"id": "f1", "type": "furniture", "points": [{"x": 10, "y": 0}, {"x": 40, "y": 30}]},
    ]
    codes = {issue["code"] for issue in validate_plan(entities)}
    assert "furniture_touching_wall" in codes


def test_validator_reports_furniture_overlap_and_narrow_door():
    entities = [
        {"id": "w1", "type": "wall", "thickness": 14, "points": [{"x": 0, "y": 0}, {"x": 400, "y": 0}]},
        {"id": "f1", "type": "furniture", "points": [{"x": 100, "y": 100}, {"x": 220, "y": 200}]},
        {"id": "f2", "type": "furniture", "points": [{"x": 180, "y": 150}, {"x": 300, "y": 250}]},
        {"id": "d1", "type": "door", "points": [{"x": 300, "y": 0}, {"x": 340, "y": 0}], "height": 210},
    ]
    codes = {issue["code"] for issue in validate_plan(entities)}
    assert "furniture_overlap" in codes
    assert "door_too_narrow" in codes