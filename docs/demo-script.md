# Five-Minute Demo and Viva Script

## 0:00–0:35 — Workspace

Open Meridian Studio and point out the world grid, camera zoom, coordinate readout, layer panel, and 2D/3D view switch. Explain that the drawing document stores centimeter coordinates while the UI reports meters.

## 0:35–1:00 — 3D model

Open the live 3D inset, then expand the 3D view. Orbit the model and switch to Move mode; drag a wall, return to 2D, and show that the same wall has moved in the plan. Change its 3D height in Properties and reopen the 3D view to show the persisted extrusion.

## 1:00–1:55 — Draw and edit

Choose Wall and drag out a horizontal segment. Change its thickness in Properties, duplicate it, and undo/redo. Switch to Rectangle and Circle and draw a room outline and fixture. Toggle a layer’s visibility, then use Space-drag to pan and cursor-wheel zoom to show the camera transform.

## 1:55–2:35 — Precision

Turn on endpoint object snaps and start a line near a wall endpoint. Hold Shift to constrain the line to horizontal or vertical. Enter `@3000<90` in the command field to create a 3000 mm relative segment at 90 degrees. Use the dimension tool and select the result.

## 2:35–3:15 — Rooms and projects

Open the sample menu and load Compact 1BHK. Turn on Rooms to compute closed-loop area and perimeter. Save it to SQLite, open the project list, then load Family 2BHK. Mention that localStorage autosave is independent of server save.

## 3:15–3:50 — Export

Export the plan as SVG, PNG, PDF, and DXF. Explain that SVG is serialized manually, PDF adds a title block, DXF is a CAD interchange file, and PNG pixels are plotted with the custom raster algorithms.

## 3:50–4:40 — Algorithm Lab

Open Lab. Run Bresenham and DDA and compare plotted pixels, decision traces, and timing. Switch to Midpoint Circle, then Cohen-Sutherland, Sutherland-Hodgman, Scanline, and Matrix Transform. Point out the output-match indicator and that one trace comes from JS while the other comes from Python.

## 4:40–5:00 — Verification

Show `pytest backend/tests -q` and summarize the concepts: rasterization, homogeneous transforms, clipping, geometric hit-testing, coordinate systems, and serialization.

## Viva prompts

- Why does Bresenham use an integer decision variable instead of accumulating floating-point slopes?
- How does cursor-anchored zoom preserve the point under the mouse?
- Why does Sutherland-Hodgman require a convex clipping polygon in this implementation?
- How do the Cohen-Sutherland outcodes reject a segment without computing intersections?
- What is the distinction between world coordinates and device pixels in this editor?