"""Create the demo accounts (data/accounts.json) via the CLI, then set admin-side flags by SQL.
Run with the backend venv from backend/. Idempotent.
"""
import json
import pathlib
import subprocess
import sys

from sqlalchemy import create_engine, text

from app.config import settings

HERE = pathlib.Path(__file__).resolve().parent
accounts = json.loads((HERE / "data/accounts.json").read_text())
engine = create_engine(settings.DATABASE_URL_SYNC)

with engine.begin() as db:
    existing = {r[0] for r in db.execute(text("select email from teachers"))}

for acc in accounts.values():
    if acc["email"] in existing:
        continue
    cmd = [sys.executable, "-m", "app.cli", "create-user", "--email", acc["email"], "--password", acc["password"]]
    if acc["role"] == "admin":
        cmd += ["--role", "admin", "--allow-admin"]
    subprocess.run(cmd, check=True, capture_output=True)
    print("created", acc["email"])

with engine.begin() as db:
    for acc in accounts.values():
        sets = {k: acc[k] for k in ("storage_mode", "allow_server_results", "allow_exercise_sharing") if k in acc}
        if acc.get("pending"):
            db.execute(text("update teachers set approved_at = null where email = :e"), {"e": acc["email"]})
        for col, val in sets.items():
            db.execute(text(f"update teachers set {col} = :v where email = :e"), {"v": val, "e": acc["email"]})
print("accounts ready")
