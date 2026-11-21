"""Simple 2D geometry functions."""

from typing import Sequence

Point = tuple[float, float]


def point_segment_distance(point: Point, start: Point, end: Point) -> float:
    """Find the shortest distance from a point to a line segment."""
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    length_squared = dx * dx + dy * dy

    if length_squared == 0:
        t = 0.0
    else:
        dot = (point[0] - start[0]) * dx + (point[1] - start[1]) * dy
        t = dot / length_squared
        if t < 0:
            t = 0
        if t > 1:
            t = 1

    closest_x = start[0] + t * dx
    closest_y = start[1] + t * dy
    distance_x = point[0] - closest_x
    distance_y = point[1] - closest_y
    return (distance_x * distance_x + distance_y * distance_y) ** 0.5


def point_in_polygon(point: Point, polygon: Sequence[Point]) -> bool:
    """Check whether a point is inside a polygon using crossing rays."""
    inside = False
    previous_index = len(polygon) - 1

    for index in range(len(polygon)):
        current = polygon[index]
        previous = polygon[previous_index]

        crosses_y = (current[1] > point[1]) != (previous[1] > point[1])
        if crosses_y:
            crossing_x = (
                (previous[0] - current[0])
                * (point[1] - current[1])
                / (previous[1] - current[1])
                + current[0]
            )
            if point[0] < crossing_x:
                inside = not inside

        previous_index = index

    return inside


def line_intersection(
    a: Point,
    b: Point,
    c: Point,
    d: Point,
    *,
    segments: bool = True,
) -> Point | None:
    """Find where two straight lines meet."""
    first_dx = b[0] - a[0]
    first_dy = b[1] - a[1]
    second_dx = d[0] - c[0]
    second_dy = d[1] - c[1]

    denominator = first_dx * second_dy - first_dy * second_dx
    if abs(denominator) < 0.000000000001:
        return None

    dx = c[0] - a[0]
    dy = c[1] - a[1]
    first_t = (dx * second_dy - dy * second_dx) / denominator
    second_t = (dx * first_dy - dy * first_dx) / denominator

    if segments:
        if first_t < 0 or first_t > 1:
            return None
        if second_t < 0 or second_t > 1:
            return None

    x = a[0] + first_t * first_dx
    y = a[1] + first_t * first_dy
    return x, y


def polygon_metrics(polygon: Sequence[Point]) -> dict[str, object]:
    """Calculate area, perimeter, and centroid of a polygon."""
    if len(polygon) < 3:
        return {"area": 0.0, "perimeter": 0.0, "centroid": None}

    cross_sum = 0.0
    centroid_x_sum = 0.0
    centroid_y_sum = 0.0
    perimeter = 0.0

    for index in range(len(polygon)):
        point = polygon[index]
        next_point = polygon[(index + 1) % len(polygon)]

        cross = point[0] * next_point[1] - next_point[0] * point[1]
        cross_sum = cross_sum + cross
        centroid_x_sum = centroid_x_sum + (point[0] + next_point[0]) * cross
        centroid_y_sum = centroid_y_sum + (point[1] + next_point[1]) * cross

        dx = next_point[0] - point[0]
        dy = next_point[1] - point[1]
        perimeter = perimeter + (dx * dx + dy * dy) ** 0.5

    area = abs(cross_sum) / 2
    if abs(cross_sum) < 0.000000000001:
        centroid = None
    else:
        centroid = (
            centroid_x_sum / (3 * cross_sum),
            centroid_y_sum / (3 * cross_sum),
        )

    return {
        "area": area,
        "perimeter": perimeter,
        "centroid": centroid,
    }