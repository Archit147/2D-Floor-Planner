from app import app


def test_project_crud_validation_and_room_api(tmp_path):
    previous_path = app.instance_path
    app.instance_path = str(tmp_path)
    try:
        client = app.test_client()
        entities = [
            {"id": "1", "type": "wall", "points": [{"x": 0, "y": 0}, {"x": 400, "y": 0}]},
            {"id": "2", "type": "wall", "points": [{"x": 400, "y": 0}, {"x": 400, "y": 300}]},
            {"id": "3", "type": "wall", "points": [{"x": 400, "y": 300}, {"x": 0, "y": 300}]},
            {"id": "4", "type": "wall", "points": [{"x": 0, "y": 300}, {"x": 0, "y": 0}]},
        ]
        document = {"title": "API plan", "entities": entities}
        created = client.post("/api/projects", json=document)
        assert created.status_code == 201
        project_id = created.get_json()["id"]
        assert client.get(f"/api/projects/{project_id}").get_json()["document"]["title"] == "API plan"
        assert client.put(f"/api/projects/{project_id}", json={**document, "title": "Renamed"}).status_code == 200
        assert client.get("/api/projects").get_json()[0]["title"] == "Renamed"
        assert client.delete(f"/api/projects/{project_id}").get_json()["deleted"] is True
        assert client.get(f"/api/projects/{project_id}").status_code == 404
        assert client.post("/api/projects", json={"title": "Bad", "entities": [{"type": "bad", "points": []}]}).status_code == 400
        assert client.post("/api/projects", json={"title": "Bad height", "entities": [{"type": "wall", "points": [{"x": 0, "y": 0}], "height": 5000}]}).status_code == 400
        rooms = client.post("/api/geometry/rooms", json=document).get_json()["rooms"]
        assert len(rooms) == 1 and rooms[0]["area"] == 12
        assert len(client.get("/api/samples").get_json()) == 3
    finally:
        app.instance_path = previous_path


def test_algorithm_api_traces_and_invalid_input():
    client = app.test_client()
    result = client.post("/api/lab/bresenham", json={"start": [2, 3], "end": [18, 11]})
    assert result.status_code == 200 and result.get_json()["steps"][-1]["x"] == 18
    assert client.post("/api/lab/cohen-sutherland", json={"start": [0, 0], "end": [1, 1], "rect": [0]}).status_code == 400


def test_export_api_returns_real_signatures():
    client = app.test_client()
    document = {"title": "Export fixture", "entities": [{"type": "wall", "points": [{"x": 0, "y": 0}, {"x": 200, "y": 100}], "thickness": 10}]}
    expected = {"svg": b"<svg", "pdf": b"%PDF", "dxf": b"0\nSECTION", "png": b"\x89PNG"}
    for file_format, signature in expected.items():
        response = client.post(f"/api/export/{file_format}", json=document)
        assert response.status_code == 200
        assert response.data.lstrip().startswith(signature)