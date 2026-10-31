"""Synthetic scans for a compiled demo exam: pseudonymous QR sticker, handwriting, MC crosses, copier noise.
Student quality follows normal quantiles (data/classes.json). Usage: python -I mkscans.py <exam.pdf> <key> <out.pdf> <plan.json>
"""
import hashlib
import io
import json
import random
import statistics
import sys
from pathlib import Path

import numpy as np
import pymupdf
import qrcode
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
SRC, KEY, OUT, PLAN = sys.argv[1:5]
CFG = json.loads((HERE / "data/classes.json").read_text())[KEY]
FONTS = sorted(str(p) for p in (HERE / ".state/fonts").glob("*.ttf"))
DPI = 160
S = DPI / 72
MAX = {"q1": 4, "q2": 5, "q3": 3}
MC_KEYS = [[0, 2], [2], [0]]
MC_POINTS = [2, 1, 1]

# Answer texts per quality level: 0 = right, 1 = partly right, 2 = wrong.
ANS = json.loads((HERE / "data/answers.json").read_text())
ans = {**ANS["common"], **ANS[CFG.get("answers", "A")]}


def targets(n, mean, sd, seed):
    dist = statistics.NormalDist(mean, sd)
    vals = [min(98.0, max(18.0, dist.inv_cdf((i + 0.5) / n))) for i in range(n)]
    random.Random(seed).shuffle(vals)
    return vals


def level(frac):
    return 0 if frac >= 0.75 else (1 if frac >= 0.4 else 2)


def half(v, hi):
    return max(0.0, min(hi, round(v * 2) / 2))


doc = pymupdf.open(SRC)
# MC answer boxes on any page: {exercise: (page, {option: rect})}, in reading order.
boxes = {}
for pno, page in enumerate(doc):
    for ln in page.get_links():
        uri = ln.get("uri", "")
        if not uri.startswith("omr://") or "__fid__" in uri or uri.endswith("/redo"):
            continue
        ex, opt = uri.split("omr://")[1].split("/")[:2]
        boxes.setdefault(ex, (pno, {}))[1][int(opt)] = ln["from"]
order = sorted(boxes, key=lambda e: (boxes[e][0], boxes[e][1][0].y0))
base = [Image.open(io.BytesIO(p.get_pixmap(dpi=DPI).tobytes("png"))).convert("RGB") for p in doc]

# Handwriting starts below the prompt it answers, wherever the exam layout puts it: (page, y) from the compiled text.
ANCHORS = {"q1a": "Wandle die Dezimalzahl", "q1b": "in eine Hexadezimalzahl um", "q2a": "Sortiere die Folge", "q2b": "Begründe, warum Bubblesort", "q3": "Formuliere eine SQL"}


def anchor(text):
    for pno, page in enumerate(doc):
        for b in page.get_text("blocks"):
            if text in b[4].replace("\n", " "):
                return pno, b[3] + 6
    raise SystemExit(f"prompt not found in {SRC}: {text}")


SPOT = {k: anchor(t) for k, t in ANCHORS.items()}


def write(d, lines, x, y, font, r, ink, lh=17):
    for i, t in enumerate(lines):
        d.text(((x + r.uniform(-2, 2)) * S, (y + i * lh + r.uniform(-1.5, 1.5)) * S), t, font=font, fill=ink)


def cross(d, rect, r, ink, pen=2.2):
    x0, y0, x1, y1 = (v * S for v in (rect.x0 + 1.5, rect.y0 + 1.5, rect.x0 + 11, rect.y1 - 1.5))
    j = lambda: r.uniform(-2, 2)  # noqa: E731
    w = int(pen * S / 2)
    d.line([(x0 + j(), y0 + j()), (x1 + j(), y1 + j())], fill=ink, width=w)
    d.line([(x1 + j(), y0 + j()), (x0 + j(), y1 + j())], fill=ink, width=w)


def sticker(payload):
    q = qrcode.QRCode(box_size=4, border=1)
    q.add_data(payload)
    q.make()
    im = q.make_image(fill_color="black", back_color="white").convert("RGB")
    sz = int(52 * S)
    im = im.resize((sz, sz), Image.NEAREST)
    lab = Image.new("RGB", (sz + int(6 * S), sz + int(6 * S)), (252, 252, 250))
    lab.paste(im, (int(3 * S), int(3 * S)))
    return lab


def undo(d, rect, r, ink):
    """Box filled in with the pen: the pupil cancels this answer."""
    for k in range(9):
        y = (rect.y0 + 2 + k * (rect.y1 - rect.y0 - 4) / 8) * S
        d.line([((rect.x0 + 1.5) * S, y + r.uniform(-1, 1)), ((rect.x0 + 11) * S, y + r.uniform(-1, 1))], fill=ink, width=int(2.4 * S))


def redo(d, rect, r, ink):
    """Cross in the zone left of the box: the pupil re-selects a cancelled answer."""
    # Bold: detection wants about half the zone inked (redoMarkedHigh).
    cross(d, pymupdf.Rect(rect.x0 - 12.5, rect.y0, rect.x0 - 2, rect.y1), r, ink, pen=7)


def faint(d, rect, r):
    """A light, short stroke: detection should flag this box as unsure."""
    x0, y0 = (rect.x0 + 4) * S, (rect.y0 + 4) * S
    d.line([(x0, y0), (x0 + 3.5 * S, y0 + 4 * S)], fill=(150, 160, 190), width=int(1.1 * S))


def scanify(im, r):
    im = im.rotate(r.uniform(-0.6, 0.6), resample=Image.BICUBIC, fillcolor=(245, 245, 242))
    a = np.asarray(im).astype(np.int16)
    a = a * np.array([0.975, 0.975, 0.965]) + np.random.default_rng(r.randint(0, 9999)).normal(0, 4, a.shape)
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.35))
    b = io.BytesIO()
    im.save(b, "JPEG", quality=70)
    return b.getvalue()


plan = {}
out = pymupdf.open()
showcase = None  # first mid-range pupil who misses MC 1 gets the marks from CFG["showcase"]
show_pdf = pymupdf.open()
for idx, pct in enumerate(targets(CFG["size"], CFG["mean"], CFG["sd"], CFG["seed"])):
    r = random.Random(CFG["seed"] * 1000 + idx)
    f = pct / 100
    pseudo = hashlib.sha256(f"{KEY}-{idx}".encode()).hexdigest()[:24]
    code = "".join("ABCDEFGHJKMNPQRSTVWXYZ23456789"[int(pseudo[i:i + 2], 16) % 30] for i in range(0, 12, 2))
    # MC first: each question right with probability f; its points come from the OMR later.
    mc_right = [r.random() < f for _ in MC_KEYS]
    mc_pts = sum(p for p, ok in zip(MC_POINTS, mc_right, strict=True) if ok)
    remaining = max(0.0, 16 * f - mc_pts)
    q1_bias = CFG.get("q1_bias", 0.0)
    fr = {k: min(1.0, max(0.0, remaining / 12 + r.uniform(-0.12, 0.12) + (q1_bias if k == "q1" else 0))) for k in MAX}
    scores = {k: half(MAX[k] * fr[k], MAX[k]) for k in MAX}
    # Keyed by the prefix the grading view shows: the raw pseudonym, or its SHA-256 once stored server-side.
    entry = {"pct": round(pct, 1), "scores": scores, "mc_right": mc_right}
    plan[pseudo[:10]] = entry
    plan[hashlib.sha256(pseudo.encode()).hexdigest()[:10]] = entry

    font = ImageFont.truetype(FONTS[idx % len(FONTS)], int((17 if FONTS[idx % len(FONTS)].endswith("Caveat.ttf") else 14) * S))
    ink = r.choice([(20, 40, 120), (25, 25, 60), (10, 30, 90)])
    pages = [im.copy() for im in base]
    lab = sticker(f"BG:{pseudo}:A:{code}").rotate(r.uniform(-4, 4), expand=True, fillcolor=(255, 255, 255))
    pages[0].paste(lab, (int(56 * S), int(50 * S)))
    draw = [ImageDraw.Draw(im) for im in pages]
    for k, q, lh in (("q1a", "q1", 17), ("q1b", "q1", 17), ("q2a", "q2", 17), ("q2b", "q2", 28), ("q3", "q3", 28)):
        pno, y = SPOT[k]
        write(draw[pno], ans[k][level(fr[q])], 40, y, font, r, ink, lh=lh)
    special = CFG.get("showcase") if showcase is None and not mc_right[0] and 50 <= pct <= 75 else None
    for qi, ex in enumerate(order):
        d2, opts = draw[boxes[ex][0]], boxes[ex][1]
        if special and qi == 0:
            showcase = pseudo
            for o, how in enumerate(special):
                if how == "x":
                    cross(d2, opts[o], r, ink)
                elif how == "undo-redo":
                    undo(d2, opts[o], r, ink)
                    redo(d2, opts[o], r, ink)
                elif how == "faint":
                    faint(d2, opts[o], r)
            continue
        chosen = set(MC_KEYS[qi]) if mc_right[qi] else {(MC_KEYS[qi][0] + 1 + r.randrange(3)) % 4}
        for o in chosen:
            cross(d2, opts[o], r, ink)
    for im in pages:
        data = scanify(im, r)
        for doc_ in (out, show_pdf) if special else (out,):
            pg = doc_.new_page(width=595.28, height=841.89)
            pg.insert_image(pg.rect, stream=data)
out.save(OUT, deflate=True)
if showcase:
    # Single booklet, so the showcase can be re-imported into an existing instance.
    show_pdf.save(OUT.replace(".pdf", "-showcase.pdf"), deflate=True)
    print(KEY, "showcase", showcase[:10], hashlib.sha256(showcase.encode()).hexdigest()[:10])
Path(PLAN).write_text(json.dumps(plan, indent=1))
print(KEY, "students", len(plan) // 2, "mean target", round(statistics.mean(v["pct"] for v in plan.values()), 1))
