"""Read-only sample plan catalog endpoints."""

import json
from pathlib import Path

from flask import Blueprint, current_app, jsonify

from backend.models.projects import validate_document

samples_api = Blueprint("samples_api", __name__)


@samples_api.get("/api/samples")
def list_samples():
    sample_directory = Path(current_app.root_path) / "samples"
    samples = []
    for path in sorted(sample_directory.glob("*.json")):
        try:
            document = validate_document(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, ValueError, json.JSONDecodeError):
            continue
        samples.append({"id": path.stem, "title": document["title"], "entities": document["entities"]})
    return jsonify(samples)