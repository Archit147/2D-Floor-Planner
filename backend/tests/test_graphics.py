import math

from backend.algorithms.clipping import cohen_sutherland_clip, liang_barsky_clip, sutherland_hodgman_clip
from backend.algorithms.geometry import line_intersection, point_in_polygon, point_segment_distance, polygon_metrics
from backend.algorithms.raster import bresenham_line, dda_line, midpoint_circle, scanline_fill
from backend.algorithms.transforms import Matrix3


def test_raster_algorithms_cover_endpoints_and_symmetry():
    assert dda_line((0, 0), (5, 3))[0] == (0, 0)
    assert dda_line((0, 0), (5, 3))[-1] == (5, 3)
    pixels = bresenham_line((5, 3), (0, 0))
    assert pixels[0] == (5, 3) and pixels[-1] == (0, 0)
    circle = set(midpoint_circle((2, -1), 5))
    assert (7, -1) in circle and (-3, -1) in circle and (2, 4) in circle and (2, -6) in circle
    assert scanline_fill([(0, 0), (4, 0), (4, 4), (0, 4)])


def test_line_clippers_agree_on_crossing_and_rejection():
    rect = (0, 0, 10, 10)
    cohen = cohen_sutherland_clip((-5, 5), (15, 5), rect)
    liang = liang_barsky_clip((-5, 5), (15, 5), rect)
    assert cohen == ((0.0, 5), (10, 5))
    assert liang == cohen
    assert cohen_sutherland_clip((-5, -2), (-1, 12), rect) is None
    assert liang_barsky_clip((-5, -2), (-1, 12), rect) is None


def test_polygon_clip_and_geometry_metrics():
    clipped = sutherland_hodgman_clip([(-1, 1), (3, 1), (3, 3), (-1, 3)], [(0, 0), (2, 0), (2, 2), (0, 2)])
    metrics = polygon_metrics(clipped)
    assert math.isclose(metrics["area"], 2)
    assert point_in_polygon((1, 1), clipped)
    assert not point_in_polygon((3, 1), clipped)
    assert point_segment_distance((1, 2), (0, 0), (2, 0)) == 2
    assert line_intersection((0, 0), (2, 2), (0, 2), (2, 0)) == (1, 1)


def test_matrix_composition_and_inverse_round_trip():
    transform = Matrix3.translate(5, -3).compose(Matrix3.rotate(0.4)).compose(Matrix3.scale(2, 3))
    point = (8.5, 2.0)
    recovered = transform.inverse().transform_point(transform.transform_point(point))
    assert math.isclose(recovered[0], point[0], abs_tol=1e-9)
    assert math.isclose(recovered[1], point[1], abs_tol=1e-9)