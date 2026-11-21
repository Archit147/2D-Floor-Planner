export class Matrix3 {
  constructor(values = [1, 0, 0, 0, 1, 0, 0, 0, 1]) {
    if (values.length !== 9 || values.some((value) => !Number.isFinite(value))) {
      throw new TypeError('Matrix3 requires nine finite values');
    }
    this.values = [...values];
  }

  static identity() { return new Matrix3(); }

  static translate(tx, ty) {
    return new Matrix3([1, 0, tx, 0, 1, ty, 0, 0, 1]);
  }

  static rotate(radians) {
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    return new Matrix3([cosine, -sine, 0, sine, cosine, 0, 0, 0, 1]);
  }

  static scale(sx, sy = sx) {
    return new Matrix3([sx, 0, 0, 0, sy, 0, 0, 0, 1]);
  }

  static mirrorX() { return Matrix3.scale(1, -1); }
  static mirrorY() { return Matrix3.scale(-1, 1); }

  // Matrix multiplication composes transforms, with the right-hand transform applied first.
  compose(other) {
    const a = this.values;
    const b = other.values;
    const result = new Array(9);
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        result[row * 3 + column] = a[row * 3] * b[column]
          + a[row * 3 + 1] * b[column + 3]
          + a[row * 3 + 2] * b[column + 6];
      }
    }
    return new Matrix3(result);
  }

  inverse() {
    const [a, b, c, d, e, f, g, h, i] = this.values;
    const cofactors = [
      e * i - f * h, c * h - b * i, b * f - c * e,
      f * g - d * i, a * i - c * g, c * d - a * f,
      d * h - e * g, b * g - a * h, a * e - b * d,
    ];
    const determinant = a * cofactors[0] + b * cofactors[3] + c * cofactors[6];
    if (Math.abs(determinant) < 1e-12) throw new Error('Cannot invert a singular Matrix3');
    return new Matrix3(cofactors.map((value) => value / determinant));
  }

  transformPoint(x, y) {
    const m = this.values;
    const homogeneous = m[6] * x + m[7] * y + m[8];
    if (Math.abs(homogeneous) < 1e-12) throw new Error('Point transformed to infinity');
    return {
      x: (m[0] * x + m[1] * y + m[2]) / homogeneous,
      y: (m[3] * x + m[4] * y + m[5]) / homogeneous,
    };
  }
}