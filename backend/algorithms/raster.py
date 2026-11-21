"""Simple rasterization algorithms."""

import math
from typing import Sequence

Point = tuple[float, float]
Pixel = tuple[int, int]


def round_pixel(value: float) -> int:
    """Round a coordinate like JavaScript Math.round."""
    return math.floor(value + 0.5)


def dda_line(start: Point, end: Point) -> list[Pixel]:
    """Draw a line using equally spaced points."""
    dx = end[0] - start[0]
    dy = end[1] - start[1]

    steps = math.ceil(max(abs(dx), abs(dy)))
    if steps == 0:
        x = round_pixel(start[0])
        y = round_pixel(start[1])
        return [(x, y)]

    x_change = dx / steps
    y_change = dy / steps
    pixels = []

    for step in range(steps + 1):
        x = round_pixel(start[0] + step * x_change)
        y = round_pixel(start[1] + step * y_change)
        pixels.append((x, y))

    return pixels


def bresenham_trace(start: Point, end: Point) -> list[dict[str, int]]:
    """Draw a line and store every decision step."""
    x = round_pixel(start[0])
    y = round_pixel(start[1])
    end_x = round_pixel(end[0])
    end_y = round_pixel(end[1])

    dx = abs(end_x - x)
    dy = abs(end_y - y)

    if x < end_x:
        x_direction = 1
    else:
        x_direction = -1

    if y < end_y:
        y_direction = 1
    else:
        y_direction = -1

    error = dx - dy
    trace = []

    while True:
        trace.append({"x": x, "y": y, "error": error})

        if x == end_x and y == end_y:
            break

        double_error = 2 * error

        if double_error > -dy:
            error = error - dy
            x = x + x_direction

        if double_error < dx:
            error = error + dx
            y = y + y_direction

    return trace


def bresenham_line(start: Point, end: Point) -> list[Pixel]:
    """Return only the pixels from Bresenham."""
    trace = bresenham_trace(start, end)
    pixels = []
    for step in trace:
        pixels.append((step["x"], step["y"]))
    return pixels


def midpoint_circle_trace(center: Point, radius: int) -> list[dict[str, int]]:
    """Calculate the points in one octant of a circle."""
    x = 0
    y = max(0, round_pixel(radius))
    decision = 1 - y
    trace = []

    while x <= y:
        trace.append({"x": x, "y": y, "decision": decision})
        x = x + 1

        if decision < 0:
            decision = decision + 2 * x + 1
        else:
            y = y - 1
            decision = decision + 2 * (x - y) + 1

    return trace


def midpoint_circle(center: Point, radius: int) -> list[Pixel]:
    """Use eight-way symmetry to draw a complete circle."""
    center_x = round(center[0])
    center_y = round(center[1])
    pixels = set()

    for step in midpoint_circle_trace(center, radius):
        x = step["x"]
        y = step["y"]

        points = [
            (x, y),
            (y, x),
            (-x, y),
            (-y, x),
            (x, -y),
            (y, -x),
            (-x, -y),
            (-y, -x),
        ]

        for offset_x, offset_y in points:
            pixels.add((center_x + offset_x, center_y + offset_y))

    return sorted(pixels)


def scanline_fill(vertices: Sequence[Point]) -> list[tuple[int, int, int]]:
    """Fill a polygon using horizontal scanlines."""
    if len(vertices) < 3:
        return []

    minimum_y = math.ceil(min(point[1] for point in vertices))
    maximum_y = math.floor(max(point[1] for point in vertices))
    spans = []

    for y in range(minimum_y, maximum_y + 1):
        intersection_x = []

        for index in range(len(vertices)):
            first = vertices[index]
            second = vertices[(index + 1) % len(vertices)]

            crosses_line = (
                (first[1] <= y < second[1])
                or (second[1] <= y < first[1])
            )
            if crosses_line:
                x = first[0] + (
                    (y - first[1])
                    * (second[0] - first[0])
                    / (second[1] - first[1])
                )
                intersection_x.append(x)

        intersection_x.sort()

        index = 0
        while index + 1 < len(intersection_x):
            left = math.ceil(intersection_x[index])
            right = math.floor(intersection_x[index + 1])
            spans.append((y, left, right))
            index = index + 2

    return spans