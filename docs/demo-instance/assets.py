"""Crop .state/shots into docs/screenshots/pitch/ (JPEG, max 2400 px wide). Boxes are in capture pixels (2x)."""
from pathlib import Path

import pymupdf
from PIL import Image

HERE = Path(__file__).resolve().parent
SHOTS = HERE / ".state/shots"
OUT = HERE.parent / "screenshots/pitch"

SPEC = {
    "01-dashboard": ("dashboard", (0, 0, 3200, 1000)),
    "02-library": ("library", None),
    "03-exercise-editor": ("editor", (160, 96, 3040, 1900)),
    "03b-mc-editor": ("editor-mc", (160, 96, 3040, 1900)),
    "04-exam-builder": ("exam-new", None),
    "04b-exam-setup": ("exam-setup", None),
    "05-scan-import": ("scan", None),
    "06-grading": ("grading", None),
    "07-mc-review": ("mc-review", (330, 300, 3200, 1520)),
    "08-results": ("results", None),
    "08b-paper-entry": ("paper", None),
    "09-analytics": ("analytics", None),
    "09b-variant-comparison": ("analytics-variants", (40, 180, 1600, 1080)),
    "10-settings-storage": ("settings", (300, 120, 2480, 1360)),
    "11-security": ("security", (300, 120, 2480, 1360)),
    "12-signin-second-factor": ("onboarding-2fa", (820, 405, 2380, 1620)),
    "13-storage-choice": ("onboarding-storage", (820, 620, 2380, 1380)),
    "14-admin-accounts": ("admin-accounts", (340, 120, 2860, 1640)),
    "15-admin-approvals": ("admin-approvals", (340, 120, 2860, 1800)),
    "16-admin-domains": ("admin-domains", (340, 120, 2860, 1420)),
    "19-shared-library": ("shared", None),
    "20-share-confirm": ("share-confirm", (160, 96, 3040, 1100)),
    "21-proposal-review": ("proposal", (420, 400, 2740, 1620)),
}

for name, (src, crop) in SPEC.items():
    im = Image.open(SHOTS / f"{src}.png").convert("RGB")
    if crop:
        im = im.crop(crop)
    if im.width > 2400:
        im = im.resize((2400, round(im.height * 2400 / im.width)), Image.LANCZOS)
    im.save(OUT / f"{name}.jpg", quality=86, optimize=True, progressive=True)

scan = pymupdf.open(HERE / ".state/scan-10b.pdf")
for idx, name in [(12, "17-scanned-sheet"), (13, "18-scanned-sheet-mc")]:
    pm = scan[idx].get_pixmap(dpi=150)
    Image.frombytes("RGB", (pm.width, pm.height), pm.samples).save(OUT / f"{name}.jpg", quality=84, optimize=True)
# UI tour posters: captures from the 1280 px window (capture.mjs tour-*), cropped to the content.
TOUR = {
    "t-exercise-editor": ("tour-editor", (135, 90, 2430, 1515)),
    "t-mc-editor": ("tour-editor-mc", (165, 90, 1260, 1515)),
    "t-exam-builder": ("tour-exam-new", (45, 105, 1260, 1600)),
    "t-exam-setup": ("tour-exam-setup", (375, 120, 2514, 1530)),
    "t-grading": ("tour-grading", (135, 0, 2560, 1530)),
    "t-paper-entry": ("tour-paper", (375, 120, 2514, 1600)),
    "t-results": ("tour-results", (345, 120, 2560, 1600)),
    "t-exercise-editor-tight": ("tour-editor", (135, 360, 2430, 1385)),
    "t-library": ("tour-library", (600, 400, 2515, 1170)),
    "t-proposal": ("tour-proposal", (135, 210, 2430, 1395)),
}
(OUT / "tour").mkdir(exist_ok=True)
for name, (src, crop) in TOUR.items():
    Image.open(SHOTS / f"{src}.png").convert("RGB").crop(crop).save(OUT / "tour" / f"{name}.jpg", quality=88, optimize=True)
# MC check: scan strip above the answer panel; the empty viewer area in between is dropped.
mc = Image.open(SHOTS / "tour-mc-review.png").convert("RGB")
head, strip, panel = mc.crop((400, 350, 1525, 470)), mc.crop((459, 1236, 1584, 1359)), mc.crop((1659, 639, 2466, 1554))
W = strip.width
strip = strip.resize((W, round(strip.height * W / strip.width)), Image.LANCZOS)
panel = panel.resize((W, round(panel.height * W / panel.width)), Image.LANCZOS)
canvas = Image.new("RGB", (W, head.height + strip.height + panel.height + 40), (34, 39, 46))
y = 0
for part in (head, strip, panel):
    canvas.paste(part, (0, y))
    y += part.height + 20
canvas.save(OUT / "tour" / "t-mc-review.jpg", quality=88, optimize=True)
print("assets", len(SPEC) + 2 + len(TOUR) + 1)
