"""File export REST endpoint."""

from flask import Blueprint, jsonify, request, send_file
from io import BytesIO

from backend.exporters.dxf_exporter import export_dxf
from backend.exporters.pdf_exporter import export_pdf
from backend.exporters.png_exporter import export_png
from backend.exporters.svg_exporter import export_svg
from backend.models.projects import validate_document

export_api = Blueprint("export_api", __name__)
EXPORTS = {
    "svg": ("image/svg+xml", "svg", export_svg),
    "pdf": ("application/pdf", "pdf", export_pdf),
    "dxf": ("application/dxf", "dxf", export_dxf),
    "png": ("image/png", "png", export_png),
}


@export_api.post("/api/export/<format_name>")
def export_document(format_name: str):
    if format_name not in EXPORTS:
        return jsonify({"error": "Supported formats are svg, pdf, dxf, and png"}), 404
    try:
        document = validate_document(request.get_json(silent=True))
        mimetype, extension, exporter = EXPORTS[format_name]
        data = exporter(document)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except (ImportError, RuntimeError) as error:
        return jsonify({"error": f"Export dependency unavailable: {error}"}), 503
    filename = "".join(character for character in document["title"] if character.isalnum() or character in "-_ ").strip().replace(" ", "_") or "floor_plan"
    return send_file(BytesIO(data) if isinstance(data, bytes) else BytesIO(data.encode("utf-8")), mimetype=mimetype, as_attachment=True, download_name=f"{filename}.{extension}")