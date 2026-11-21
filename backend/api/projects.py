"""REST endpoints for SQLite-backed projects."""

from __future__ import annotations

import json
import uuid

from flask import Blueprint, jsonify, request

from backend.models.projects import connect, row_to_project, validate_document
from backend.services.validator import validate_plan

projects_api = Blueprint("projects_api", __name__)


@projects_api.get("/api/projects")
def list_projects():
    with connect() as connection:
        rows = connection.execute("SELECT id, title, created_at, updated_at FROM projects ORDER BY updated_at DESC").fetchall()
    return jsonify([{"id": row["id"], "title": row["title"], "createdAt": row["created_at"], "updatedAt": row["updated_at"]} for row in rows])


@projects_api.post("/api/projects")
def create_project():
    try:
        document = validate_document(request.get_json(silent=True))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    issues = validate_plan(document["entities"])
    if issues:
        return jsonify({"error": "Plan has placement or structural errors", "issues": issues}), 422
    project_id = str(uuid.uuid4())
    with connect() as connection:
        connection.execute("INSERT INTO projects (id, title, document) VALUES (?, ?, ?)", (project_id, document["title"], json.dumps(document, separators=(",", ":"))))
        row = connection.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    return jsonify(row_to_project(row)), 201


@projects_api.get("/api/projects/<project_id>")
def get_project(project_id: str):
    with connect() as connection:
        row = connection.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    if row is None:
        return jsonify({"error": "Project not found"}), 404
    return jsonify(row_to_project(row))


@projects_api.put("/api/projects/<project_id>")
def update_project(project_id: str):
    try:
        document = validate_document(request.get_json(silent=True))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    issues = validate_plan(document["entities"])
    if issues:
        return jsonify({"error": "Plan has placement or structural errors", "issues": issues}), 422
    with connect() as connection:
        cursor = connection.execute("UPDATE projects SET title = ?, document = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (document["title"], json.dumps(document, separators=(",", ":")), project_id))
        row = connection.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    if cursor.rowcount == 0:
        return jsonify({"error": "Project not found"}), 404
    return jsonify(row_to_project(row))


@projects_api.delete("/api/projects/<project_id>")
def delete_project(project_id: str):
    with connect() as connection:
        cursor = connection.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    if cursor.rowcount == 0:
        return jsonify({"error": "Project not found"}), 404
    return jsonify({"deleted": True, "id": project_id})