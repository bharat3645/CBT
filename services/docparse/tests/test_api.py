from fastapi.testclient import TestClient

from docparse.main import app

client = TestClient(app)


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_parse_endpoint_camel_case(make_docx):
    data = make_docx(["1. q", "(A) a", "(B) b", "(C) c", "(D) d"])
    r = client.post("/parse", files={"file": ("p.docx", data)})
    assert r.status_code == 200
    q = r.json()["questions"][0]
    assert q["source"]["blockStart"] == 0 and q["label"] == "EXTRACTED"


def test_unsupported_type():
    r = client.post("/parse", files={"file": ("p.txt", b"x")})
    assert r.status_code == 415


def test_corrupt_docx():
    r = client.post("/parse", files={"file": ("p.docx", b"notzip")})
    assert r.status_code == 422
