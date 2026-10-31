"""Crop .state/shots into docs/screenshots/pitch/ and guide/ (JPEG, max 2400 px wide). Boxes are in capture pixels (2x); `assets.py guide` crops only the guide set."""
import sys
from pathlib import Path

import pymupdf
from PIL import Image

HERE = Path(__file__).resolve().parent
SHOTS = HERE / ".state/shots"
OUT = HERE.parent / "screenshots/pitch"

# User-guide details (capture.mjs guide-*), referenced from docs/user/ and docs/de/user/.
GUIDE = {
    "exercise-score": ("guide-score", (828, 662, 2370, 1338)),
    "exercise-ai-prompt": ("guide-ai-prompt", (446, 100, 2752, 1902)),
    "exercise-compile-error": ("guide-compile-error", (30, 30, 3170, 1810)),
    "exam-exercises": ("guide-exam-exercises", (330, 100, 3200, 1870)),
    "exam-export": ("guide-exam-export", (828, 260, 2370, 1745)),
    "workspace-backup": ("guide-backup", (828, 540, 2370, 1462)),
    "help-dialog": ("guide-help", (446, 100, 2752, 1902)),
    "settings-storage": ("guide-settings-storage", (870, 170, 2840, 855)),
    "settings-mc-detection": ("guide-settings-mc", (870, 170, 2840, 1890)),
    "settings-latex-packages": ("guide-settings-packages", (870, 170, 2840, 2000)),
    "settings-security": ("guide-security", (870, 120, 2840, 1480)),
    "results-borderline": ("guide-borderline", (365, 385, 3165, 2560)),
    "admin-maintenance": ("guide-maintenance", (360, 120, 2840, 1880)),
}
(OUT.parent / "guide").mkdir(exist_ok=True)
for name, (src, crop) in GUIDE.items():
    im = Image.open(SHOTS / f"{src}.png").convert("RGB")
    if crop:
        im = im.crop(crop)
    if im.width > 2400:
        im = im.resize((2400, round(im.height * 2400 / im.width)), Image.LANCZOS)
    im.save(OUT.parent / "guide" / f"{name}.jpg", quality=86, optimize=True, progressive=True)
if sys.argv[1:] == ["guide"]:
    sys.exit(print("guide", len(GUIDE)))

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
    "t-exercise-editor": ("tour-editor", (165, 375, 2400, 1770)),
    "t-mc-editor": ("tour-editor-mc", (165, 90, 1260, 1515)),
    "t-exam-builder": ("tour-exam-new", (45, 105, 1260, 1600)),
    "t-exam-setup": ("tour-exam-setup", (420, 420, 2475, 1515)),
    "t-grading": ("tour-grading", (135, 0, 2560, 1530)),
    "t-paper-entry": ("tour-paper", (48, 220, 1752, 1600)),
    "t-results": ("tour-results", (345, 120, 2560, 1600)),
    "t-variant-diff": ("tour-variant-diff", (128, 192, 2432, 1060)),
    "t-proposal": ("tour-proposal", (135, 210, 2430, 1395)),
}
(OUT / "tour").mkdir(exist_ok=True)
for name, (src, crop) in TOUR.items():
    Image.open(SHOTS / f"{src}.png").convert("RGB").crop(crop).save(OUT / "tour" / f"{name}.jpg", quality=88, optimize=True)
# MC check: one contiguous crop of the stacked narrow-window layout (scan crop above the answer panel).
Image.open(SHOTS / "tour-mc-review.png").convert("RGB").crop((120, 1380, 2160, 3100)).save(OUT / "tour" / "t-mc-review.jpg", quality=88, optimize=True)
print("assets", len(SPEC) + 2 + len(TOUR) + 1)
