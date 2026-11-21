"""Simple 3 by 3 matrix transformations."""

import math
from typing import Iterable, Sequence


class Matrix3:
    """A 3 by 3 matrix for two-dimensional transforms."""

    def __init__(self, values: Sequence[Sequence[float]]) -> None:
        if len(values) != 3:
            raise ValueError("Matrix3 requires 3 rows")

        matrix = []
        for row in values:
            if len(row) != 3:
                raise ValueError("Matrix3 requires 3 columns")
            matrix.append([float(value) for value in row])

        self.values = matrix

    @classmethod
    def identity(cls) -> "Matrix3":
        return cls([
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [0.0, 0.0, 1.0],
        ])

    @classmethod
    def translate(cls, tx: float, ty: float) -> "Matrix3":
        return cls([
            [1.0, 0.0, tx],
            [0.0, 1.0, ty],
            [0.0, 0.0, 1.0],
        ])

    @classmethod
    def rotate(cls, radians: float) -> "Matrix3":
        cosine = math.cos(radians)
        sine = math.sin(radians)
        return cls([
            [cosine, -sine, 0.0],
            [sine, cosine, 0.0],
            [0.0, 0.0, 1.0],
        ])

    @classmethod
    def scale(cls, sx: float, sy: float | None = None) -> "Matrix3":
        if sy is None:
            sy = sx
        return cls([
            [sx, 0.0, 0.0],
            [0.0, sy, 0.0],
            [0.0, 0.0, 1.0],
        ])

    @classmethod
    def mirror_x(cls) -> "Matrix3":
        return cls.scale(1.0, -1.0)

    @classmethod
    def mirror_y(cls) -> "Matrix3":
        return cls.scale(-1.0, 1.0)

    def tolist(self) -> list[list[float]]:
        """Return a plain Python list for JSON and the API."""
        return [row.copy() for row in self.values]

    def compose(self, other: "Matrix3") -> "Matrix3":
        """Multiply this matrix by another matrix."""
        result = [[0.0, 0.0, 0.0] for _ in range(3)]

        for row in range(3):
            for column in range(3):
                total = 0.0
                for index in range(3):
                    total = total + self.values[row][index] * other.values[index][column]
                result[row][column] = total

        return Matrix3(result)

    def inverse(self) -> "Matrix3":
        """Find the inverse of this matrix."""
        a = self.values[0][0]
        b = self.values[0][1]
        c = self.values[0][2]
        d = self.values[1][0]
        e = self.values[1][1]
        f = self.values[1][2]
        g = self.values[2][0]
        h = self.values[2][1]
        i = self.values[2][2]

        determinant = (
            a * (e * i - f * h)
            - b * (d * i - f * g)
            + c * (d * h - e * g)
        )
        if abs(determinant) < 0.000000000001:
            raise ValueError("Cannot invert a singular Matrix3")

        cofactors = [
            e * i - f * h,
            c * h - b * i,
            b * f - c * e,
            f * g - d * i,
            a * i - c * g,
            c * d - a * f,
            d * h - e * g,
            b * g - a * h,
            a * e - b * d,
        ]

        inverse_values = []
        for row in range(3):
            inverse_row = []
            for column in range(3):
                inverse_row.append(cofactors[row * 3 + column] / determinant)
            inverse_values.append(inverse_row)

        return Matrix3(inverse_values)

    def transform_point(self, point: Iterable[float]) -> tuple[float, float]:
        """Move a point using this matrix."""
        x, y = point

        result_x = self.values[0][0] * x + self.values[0][1] * y + self.values[0][2]
        result_y = self.values[1][0] * x + self.values[1][1] * y + self.values[1][2]
        homogeneous = self.values[2][0] * x + self.values[2][1] * y + self.values[2][2]

        if abs(homogeneous) < 0.000000000001:
            raise ValueError("Point transformed to infinity")

        return result_x / homogeneous, result_y / homogeneous