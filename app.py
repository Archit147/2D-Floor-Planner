"""Flask entry point for the Floor Plan Designer."""

from flask import Flask, jsonify, render_template, request

from backend.api.geometry import geometry_api
from backend.api.lab import lab_api
from backend.api.projects import projects_api
from backend.api.export import export_api
from backend.api.samples import samples_api


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024
app.register_blueprint(projects_api)
app.register_blueprint(geometry_api)
app.register_blueprint(lab_api)
app.register_blueprint(export_api)
app.register_blueprint(samples_api)


@app.after_request
def local_development_cors(response):
    """Permit same-origin and localhost development clients without opening remote origins."""
    origin = request.headers.get("Origin", "")
    if origin in {request.host_url.rstrip("/"), "http://localhost:5000", "http://127.0.0.1:5000", "http://localhost:5001", "http://127.0.0.1:5001"}:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers.add("Vary", "Origin")
    return response


@app.errorhandler(413)
def request_too_large(_error):
    """Return JSON for documents that exceed the configured upload limit."""
    return jsonify({"error": "Request body exceeds the 8 MB limit"}), 413


@app.get("/")
def index():
    """Serve the CAD workspace."""
    return render_template("index.html")


@app.get("/api/health")
def health():
    """Expose a small endpoint for startup checks and future API clients."""
    return jsonify({"status": "ok", "phase": 1})


@app.get("/lab")
def algorithm_lab():
    """Serve the graphics Algorithm Lab."""
    return render_template("lab.html")


if __name__ == "__main__":
    app.run(debug=True)