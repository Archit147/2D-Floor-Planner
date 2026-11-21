# Theory and Implementation Report

## Coordinate Model

The document uses Cartesian world coordinates measured in centimeters, with positive $y$ upward. The camera maps world position $(x,y)$ to screen position $(s_x,s_y)$ by

$$s_x = o_x + zx, \qquad s_y = o_y - zy,$$

where $(o_x,o_y)$ is the screen-space camera offset and $z$ is zoom. Cursor-anchored zoom first converts the cursor to world coordinates, updates $z$, then chooses the new offset so that world point remains at the same screen location. Rendering is DPR-aware and clips visible grid lines to the viewport.

Homogeneous points are column vectors $(x,y,1)^T$. Translation, rotation, scale, and reflection are 3×3 matrices; composition is matrix multiplication, and inverse conversion uses the inverse matrix. Matrix operations are constant time.

## Rasterization

### DDA

For $dx=x_1-x_0$ and $dy=y_1-y_0$, choose $n=\lceil\max(|dx|,|dy|)\rceil$, then increment by $dx/n$ and $dy/n$ and round each sample to a pixel. This runs in $O(n)$ time and $O(n)$ output space. It is used in the Algorithm Lab and for custom line rendering.

### Bresenham

Maintain integer error $e=dx-dy$. At each pixel, compare $2e$ with $-dy$ and $dx$ to decide whether to advance x, y, or both. The decision accumulator avoids floating-point stepping. Complexity is $O(\max(|dx|,|dy|))$ time and $O(n)$ output space. The implementation is used for custom line pixels and PNG export.

### Midpoint Circle

Starting at $(0,r)$, evaluate decision value $d=1-r$. Increment x each iteration; when $d\ge0$, decrement y. Reflect each octant point through eight circle symmetries. Complexity is $O(r)$ time and $O(r)$ unique-pixel storage. Used by canvas custom rendering, lab traces, and PNG export.

### Scanline Fill

For each integer scanline, intersect polygon edges using a half-open vertical interval to avoid counting shared vertices twice. Sort x intersections and fill adjacent pairs under the even-odd rule. Current implementation scans every row and checks every edge: $O(H(E+\log E))$ time and $O(E)$ per-row temporary space, where $H$ is polygon height and $E$ edge count. Used by the Lab and available for custom polygon raster work.

## Clipping

### Cohen-Sutherland

Four outcode bits identify left, right, below, and above. A zero OR accepts the segment; a nonzero AND rejects it. Otherwise intersect the endpoint outside the window with one corresponding boundary and repeat. Runtime is proportional to the number of clipping iterations; each iteration is constant work. Used by `/api/lab/cohen-sutherland` and the lab view.

### Liang-Barsky

Represent the segment as $P(t)=P_0+t(P_1-P_0)$ for $0\le t\le1$. Four inequalities update entering and leaving parameters $(t_0,t_1)$. It is $O(1)$ for a rectangular window and is used in the same clipping comparison.

### Sutherland-Hodgman

Pass the subject polygon through each convex clip edge. For each input edge, emit current vertices and/or the edge intersection according to inside/outside transitions. Complexity is $O(V_sV_c)$ for subject and clip vertex counts. Used in the polygon-clipping lab endpoint and visualizer.

## Geometry and Transforms

- Point-to-segment distance projects onto the segment and clamps its parameter to $[0,1]$: $O(1)$. Used for entity hit tests and opening validation.
- Point-in-polygon toggles inside state for each ray-crossing edge: $O(V)$. Used by server geometry helpers and tests.
- Segment intersection solves a 2×2 determinant system, rejecting parallel lines and optionally constraining both parameters to $[0,1]$: $O(1)$. Used by miter joins and snap geometry.
- Shoelace sums compute polygon area and centroid in $O(V)$; room service uses these metrics after wall-loop extraction.
- Polyline offset computes a normal for each segment and intersects adjacent shifted lines for miter joins: $O(V)$.
- Room detection builds endpoint adjacency and enumerates simple cycles. It is intended for small floor plans; worst-case cycle enumeration is exponential in graph size.
- Grid auto-layout places rooms in rows in $O(R)$ time for $R$ rooms.

## Viewport, Selection, and Export

`Camera` stores pan and zoom and provides mutually inverse world/screen conversion. Entity hit tests use segment distance, rectangle bounds, and radial distance. Snap candidates include endpoints, midpoints, centers, segment projections, and intersections, drawn with distinct markers.

The Three.js scene maps plan coordinates $(x,y)$ to the ground plane $(x,0,y)$. Wall segments become boxes aligned to their segment direction, with thickness as box depth and the stored 3D height as extrusion height. Furniture and openings use corresponding box/cylinder primitives. A ray from the pointer intersects the ground plane to compute 3D drag deltas; the same delta is applied to the entity's 2D points, so both views share one serialized source of truth.

SVG is emitted as XML manually; PDF uses vector paths and a title block through ReportLab; DXF uses ezdxf entities/layers; PNG uses Pillow as the pixel buffer while line and circle pixels come from the project’s Bresenham/midpoint implementations. Exports fit the plan bounds to a page or image frame.

## Complexity Summary

| Algorithm/service | Time | Extra/output space |
| --- | --- | --- |
| DDA / Bresenham | $O(n)$ | $O(n)$ returned pixels |
| Midpoint circle | $O(r)$ | $O(r)$ unique pixels |
| Scanline fill | $O(H(E+\log E))$ | $O(E)$ per row plus output |
| Cohen-Sutherland | $O(k)$ clipping iterations | $O(k)$ trace |
| Liang-Barsky | $O(1)$ | $O(1)$ |
| Sutherland-Hodgman | $O(V_sV_c)$ | $O(V_s+V_c)$ intermediate polygon |
| Matrix3 point / inverse | $O(1)$ | $O(1)$ |
| Ray-cast point test | $O(V)$ | $O(1)$ |
| Polyline offset | $O(V)$ | $O(V)$ |
| Auto-layout | $O(R)$ | $O(R)$ |