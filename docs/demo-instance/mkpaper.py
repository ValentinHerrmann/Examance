"""Spreadsheet (TSV) for the paper-graded class: invented names, IDs and normally spread points."""
import json
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATE = HERE / ".state"


def state_path(arg: str) -> Path:
    """*arg* resolved; refused unless it lies in the demo's .state directory, the only place this script reads or writes."""
    p = Path(arg).resolve()
    if not p.is_relative_to(STATE):
        raise SystemExit(f"{arg} lies outside {STATE}")
    return p


cfg = json.loads((HERE / "data/classes.json").read_text())["9c"]
first = ["Lena", "Jonas", "Mia", "Elias", "Emma", "Paul", "Hannah", "Ben", "Lea", "Noah", "Sophie", "Felix",
         "Marie", "Luis", "Clara", "Finn", "Anna", "Emil", "Lina", "Moritz", "Ida", "Jakob", "Greta", "Leon"]
last = ["Albrecht", "Bauer", "Celik", "Demir", "Engel", "Fischer", "Graf", "Huber", "Ivanova", "Jung", "Keller",
        "Lang", "Meyer", "Nowak", "Ott", "Peters", "Quandt", "Roth", "Schulz", "Thiel", "Urban", "Vogel", "Weiß", "Yilmaz"]
r = random.Random(cfg["seed"])
# Seeded on purpose so the demo images are reproducible; never used for anything secret.
r.shuffle(first)  # NOSONAR(S2245)
dist = statistics.NormalDist(cfg["mean"], cfg["sd"])
pcts = [min(98, max(18, dist.inv_cdf((i + 0.5) / cfg["size"]))) for i in range(cfg["size"])]
# Seeded on purpose so the demo images are reproducible; never used for anything secret.
r.shuffle(pcts)  # NOSONAR(S2245)
rows = ["Name\tID\tAufgabe 1\tAufgabe 2"]
for i in range(cfg["size"]):
    f = pcts[i] / 100
    a = max(0, min(4, round((4 * f + r.uniform(-0.6, 0.6)) * 2) / 2))
    b = max(0, min(4, round((8 * f - a) * 2) / 2))
    rows.append(f"{last[i]}, {first[i]}\t9{300 + i}\t{a:g}\t{b:g}".replace(".", ","))
state_path(sys.argv[1]).write_text("\n".join(rows) + "\n")
print("rows", len(rows) - 1)
