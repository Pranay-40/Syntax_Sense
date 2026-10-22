import os
import requests
import pprint

s = requests.Session()
s.get("http://127.0.0.1:8000/login")
csrf = s.cookies.get("csrftoken")
s.post("http://127.0.0.1:8000/api/auth/login", json={"email": "demo@example.com", "password": "change-me-too"}, headers={"X-CSRFToken": csrf})
csrf = s.cookies.get("csrftoken")

sources = s.get("http://127.0.0.1:8000/api/sources").json().get("sources", [])
source_ids = [src["id"] for src in sources if src["status"] == "READY"]
print(f"Ready sources found ({len(source_ids)}):", source_ids)

code = """import requests
r = requests.get('https://api.github.com/events')
data = r.json()
"""
question = "How does requests handle JSON decoding and what error does it raise if decoding fails?"

r = s.post(
    "http://127.0.0.1:8000/api/ask",
    json={
        "code": code,
        "question": question,
        "language": "python",
        "source_ids": source_ids,
    },
    headers={"X-CSRFToken": csrf},
)
print("Ask status code:", r.status_code)
res_data = r.json()
print("Ask response body:", res_data)

if r.status_code == 201:
    q_id = res_data["question_id"]
    r_q = s.get(f"http://127.0.0.1:8000/api/questions/{q_id}")
    print("\n=== GET /api/questions/{id} Result ===")
    q_json = r_q.json()["question"]
    print("Evidence status:", q_json["evidence_status"])
    print("Explanation items:", len(q_json["answer"]["explanation"]))
    for exp in q_json["answer"]["explanation"]:
        print(" -", exp["text"][:100], "-> Citations:", exp["chunk_numbers"])
    print("Retrieved chunks count:", len(q_json["retrieved_chunks"]))
    for rc in q_json["retrieved_chunks"]:
        print(f" [Chunk #{rc['rank']}] Score: {rc['score']} | Cited: {rc['cited']} | Label: {rc['saved_label']}")
