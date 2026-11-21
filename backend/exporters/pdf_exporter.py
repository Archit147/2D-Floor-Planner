"""ReportLab PDF export with a fitted plan and title block."""

from __future__ import annotations

from io import BytesIO
from typing import Any


def export_pdf(document: dict[str, Any]) -> bytes:
    """Render vector entities and a title block onto a landscape A3 page."""
    from reportlab.lib.pagesizes import A3, landscape
    from reportlab.pdfgen import canvas

    output = BytesIO()
    page_width, page_height = landscape(A3)
    pdf = canvas.Canvas(output, pagesize=(page_width, page_height))
    entities = document["entities"]
    all_points = [point for entity in entities for point in entity.get("points", [])]
    min_x = min((point["x"] for point in all_points), default=0)
    max_x = max((point["x"] for point in all_points), default=1000)
    min_y = min((point["y"] for point in all_points), default=0)
    max_y = max((point["y"] for point in all_points), default=700)
    margin, title_height = 42, 48
    scale = min((page_width - margin * 2) / max(1, max_x - min_x), (page_height - title_height - margin * 2) / max(1, max_y - min_y))
    origin_x = (page_width - (max_x - min_x) * scale) / 2 - min_x * scale
    origin_y = title_height + (page_height - title_height - (max_y - min_y) * scale) / 2 - min_y * scale
    pdf.setStrokeColorRGB(0.12, 0.17, 0.15)
    for entity in entities:
        points = entity.get("points", [])
        if not points:
            continue
        pdf.setLineWidth(max(0.5, float(entity.get("thickness", 2)) * scale))
        if entity["type"] == "circle" and len(points) > 1:
            radius = ((points[1]["x"] - points[0]["x"]) ** 2 + (points[1]["y"] - points[0]["y"]) ** 2) ** 0.5
            pdf.circle(origin_x + points[0]["x"] * scale, origin_y + points[0]["y"] * scale, radius * scale, stroke=1, fill=0)
        elif entity["type"] == "rectangle" and len(points) > 1:
            x1, y1 = origin_x + points[0]["x"] * scale, origin_y + points[0]["y"] * scale
            x2, y2 = origin_x + points[1]["x"] * scale, origin_y + points[1]["y"] * scale
            pdf.rect(min(x1, x2), min(y1, y2), abs(x2 - x1), abs(y2 - y1), stroke=1, fill=0)
        elif entity["type"] == "text":
            pdf.setFont("Helvetica", 10)
            pdf.drawString(origin_x + points[0]["x"] * scale, origin_y + points[0]["y"] * scale, entity.get("label", "Text"))
        else:
            path = pdf.beginPath()
            path.moveTo(origin_x + points[0]["x"] * scale, origin_y + points[0]["y"] * scale)
            for point in points[1:]:
                path.lineTo(origin_x + point["x"] * scale, origin_y + point["y"] * scale)
            pdf.drawPath(path, stroke=1, fill=0)
    pdf.setStrokeColorRGB(0.65, 0.69, 0.66)
    pdf.line(margin, margin, page_width - margin, margin)
    pdf.setFillColorRGB(0.12, 0.17, 0.15)
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(margin, margin - 22, document.get("title", "Untitled plan"))
    pdf.setFont("Helvetica", 8)
    pdf.drawRightString(page_width - margin, margin - 22, "MERIDIAN STUDIO  |  FIT TO PAGE")
    pdf.showPage()
    pdf.save()
    return output.getvalue()