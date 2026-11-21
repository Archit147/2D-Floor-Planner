"""Simple line and polygon clipping algorithms."""

from typing import Sequence

Point = tuple[float, float]
Rect = tuple[float, float, float, float]

INSIDE = 0
LEFT = 1
RIGHT = 2
BOTTOM = 4
TOP = 8


def region_code(point: Point, rect: Rect) -> int:
    """Find which side of the rectangle a point is outside."""
    x, y = point
    xmin, ymin, xmax, ymax = rect

    code = INSIDE
    if x < xmin:
        code = code | LEFT
    elif x > xmax:
        code = code | RIGHT

    if y < ymin:
        code = code | BOTTOM
    elif y > ymax:
        code = code | TOP

    return code


def cohen_sutherland_trace(start: Point, end: Point, rect: Rect) -> dict[str, object]:
    """Trace how Cohen-Sutherland clips a line."""
    first = [start[0], start[1]]
    second = [end[0], end[1]]
    first_code = region_code(start, rect)
    second_code = region_code(end, rect)

    steps = [{
        "start": first.copy(),
        "end": second.copy(),
        "codeStart": first_code,
        "codeEnd": second_code,
    }]

    while True:
        if (first_code | second_code) == INSIDE:
            return {"accepted": True, "segment": [first, second], "steps": steps}

        if (first_code & second_code) != INSIDE:
            return {"accepted": False, "segment": None, "steps": steps}

        outside_code = first_code
        if outside_code == INSIDE:
            outside_code = second_code

        xmin, ymin, xmax, ymax = rect
        dx = second[0] - first[0]
        dy = second[1] - first[1]

        if outside_code & TOP:
            x = first[0] + dx * (ymax - first[1]) / dy
            point = [x, ymax]
        elif outside_code & BOTTOM:
            x = first[0] + dx * (ymin - first[1]) / dy
            point = [x, ymin]
        elif outside_code & RIGHT:
            y = first[1] + dy * (xmax - first[0]) / dx
            point = [xmax, y]
        else:
            y = first[1] + dy * (xmin - first[0]) / dx
            point = [xmin, y]

        if outside_code == first_code:
            first = point
            first_code = region_code((first[0], first[1]), rect)
        else:
            second = point
            second_code = region_code((second[0], second[1]), rect)

        steps.append({
            "start": first.copy(),
            "end": second.copy(),
            "codeStart": first_code,
            "codeEnd": second_code,
        })


def cohen_sutherland_clip(start: Point, end: Point, rect: Rect) -> tuple[Point, Point] | None:
    """Return the visible part of a line, or None."""
    result = cohen_sutherland_trace(start, end, rect)
    if not result["accepted"]:
        return None

    segment = result["segment"]
    if segment is None:
        return None

    first = segment[0]
    second = segment[1]
    return (first[0], first[1]), (second[0], second[1])


def liang_barsky_clip(start: Point, end: Point, rect: Rect) -> tuple[Point, Point] | None:
    """Use line parameters t to clip a line against a rectangle."""
    xmin, ymin, xmax, ymax = rect
    dx = end[0] - start[0]
    dy = end[1] - start[1]

    p = [-dx, dx, -dy, dy]
    q = [
        start[0] - xmin,
        xmax - start[0],
        start[1] - ymin,
        ymax - start[1],
    ]

    lower = 0.0
    upper = 1.0

    for index in range(4):
        if p[index] == 0:
            if q[index] < 0:
                return None
            continue

        ratio = q[index] / p[index]
        if p[index] < 0:
            if ratio > lower:
                lower = ratio
        else:
            if ratio < upper:
                upper = ratio

        if lower > upper:
            return None

    first = (start[0] + lower * dx, start[1] + lower * dy)
    second = (start[0] + upper * dx, start[1] + upper * dy)
    return first, second


def polygon_area(vertices: Sequence[Point]) -> float:
    """Calculate area using the shoelace formula."""
    if len(vertices) == 0:
        return 0.0

    area = 0.0
    for index in range(len(vertices)):
        next_index = (index + 1) % len(vertices)
        first = vertices[index]
        second = vertices[next_index]
        area = area + first[0] * second[1] - second[0] * first[1]

    return area / 2


def _line_intersection(start: Point, end: Point, clip_start: Point, clip_end: Point) -> Point:
    """Find where two line segments meet."""
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    clip_dx = clip_end[0] - clip_start[0]
    clip_dy = clip_end[1] - clip_start[1]

    denominator = dx * clip_dy - dy * clip_dx
    if abs(denominator) < 0.000000000001:
        return end

    t = (
        (clip_start[0] - start[0]) * clip_dy
        - (clip_start[1] - start[1]) * clip_dx
    ) / denominator

    x = start[0] + t * dx
    y = start[1] + t * dy
    return x, y


def sutherland_hodgman_clip(subject: Sequence[Point], clip_polygon: Sequence[Point]) -> list[Point]:
    """Clip a polygon against each edge of a convex polygon."""
    output = list(subject)
    if len(output) < 3 or len(clip_polygon) < 3:
        return []

    if polygon_area(clip_polygon) >= 0:
        orientation = 1
    else:
        orientation = -1

    for edge_index in range(len(clip_polygon)):
        clip_start = clip_polygon[edge_index]
        clip_end = clip_polygon[(edge_index + 1) % len(clip_polygon)]
        input_points = output
        output = []

        if len(input_points) == 0:
            break

        previous = input_points[-1]

        for current in input_points:
            previous_cross = (
                (clip_end[0] - clip_start[0]) * (previous[1] - clip_start[1])
                - (clip_end[1] - clip_start[1]) * (previous[0] - clip_start[0])
            )
            current_cross = (
                (clip_end[0] - clip_start[0]) * (current[1] - clip_start[1])
                - (clip_end[1] - clip_start[1]) * (current[0] - clip_start[0])
            )

            previous_inside = orientation * previous_cross >= -0.000000001
            current_inside = orientation * current_cross >= -0.000000001

            if current_inside:
                if not previous_inside:
                    intersection = _line_intersection(
                        previous, current, clip_start, clip_end
                    )
                    output.append(intersection)
                output.append(current)
            elif previous_inside:
                intersection = _line_intersection(
                    previous, current, clip_start, clip_end
                )
                output.append(intersection)

            previous = current

    return output