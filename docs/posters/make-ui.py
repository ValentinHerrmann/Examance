"""Writes the UI poster (examance-ui.md, 2 pages) and the UI deck (../pitches/examance-ui.md) from one caption list.
Poster images sit in justified rows or two columns; the split and order per page are searched so they fill the page."""
import functools
import itertools
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
P = "../screenshots/pitch/"
URL = "examance.valentin-herrmann.com"
S = {
    "editor": ("tour/t-exercise-editor.jpg", "LaTeX-Aufgabeneditor", "Bausteine per Klick, Live-Vorschau; jedes \\BE ist ein Punkt, \\hBE ein halber", "Punktzahl rechnet sich selbst"),
    "mc": ("tour/t-mc-editor.jpg", "Multiple Choice", "Optionen eintippen, richtige anhaken, Punktabzug wählen", "Kreuze werden später automatisch gelesen"),
    "builder": ("tour/t-exam-builder.jpg", "Klausur zusammenstellen", "Aufgaben und Varianten anhaken", "in Minuten statt Stunden"),
    "setup": ("tour/t-exam-setup.jpg", "Fertige Klausur", "Prüfung und Erwartungshorizont; jeder Haken zeigt, welcher Teil welchen Punkt bringt", "sofort druckbar, auch für Papierkorrektur"),
    "variantdiff": ("tour/t-variant-diff.jpg", "Varianten vergleichen", "Gruppe A und B nebeneinander, Unterschiede markiert", "nur die Zahlen ändern sich, der Aufbau bleibt"),
    "proposal": ("tour/t-proposal.jpg", "Teilen & Vorschläge", "Kollegium schlägt Änderungen vor, die Autorin entscheidet", "gemeinsamer Aufgabenpool der Fachschaft"),
    "grading": ("tour/t-grading.jpg", "Anonym korrigieren", "QR-Aufkleber statt Name; Haken-Stempel direkt im Scan ergeben die Punkte", "fair, ohne Halo-Effekt"),
    "mcreview": ("tour/t-mc-review.jpg", "MC-Erkennung", "A richtig, D neu gesetzt und als unsicher markiert: 0,5 von 2 Punkten", "Sie entscheiden im Zweifel"),
    "paper": ("tour/t-paper-entry.jpg", "Papierkorrektur", "Punkte tippen oder aus Excel einfügen", "Auswertung auch ohne Scanner"),
    "results": ("tour/t-results.jpg", "Ergebnisse", "Notenspiegel, Schnitt, Grenzfälle", "fertig, sobald die Punkte da sind"),
    "variant": ("09b-variant-comparison.jpg", "Variantenvergleich", "Gruppe B 24 Prozentpunkte schwächer", "unfaire Varianten fallen auf"),
}


W = 1123 - 2 * 28          # content width (section.tour padding)
GAP, ROWGAP, LINE = 16, 14, 18.5
CRYPTO_ASPECT = 1.0       # the encryption card behaves like an image of this shape


@functools.cache
def aspect(k):
    if k == "crypto":
        return CRYPTO_ASPECT
    im = Image.open(HERE / P / S[k][0])
    return im.width / im.height


def caption_h(k, width):
    if k == "crypto":
        return 0
    f, t, d, a = S[k]
    chars = len(t) + len(d) + len(a) + 6
    return 6 + LINE * -(-int(chars * 1.15) // max(1, int(width / 7.0)))


@functools.cache
def _row_h(ks):
    h = (W - GAP * (len(ks) - 1)) / sum(aspect(k) for k in ks)
    return h + max(caption_h(k, h * aspect(k)) for k in ks) + ROWGAP


def row_h(ks):
    return _row_h(tuple(ks))


def layout(items, avail, fixed_last=None, reorder=True, per_row=3):
    """Best order and row split: fill `avail` px without exceeding it, images at least 300 px wide."""
    best = None
    pool = [k for k in items if k != fixed_last]
    for perm in (itertools.permutations(pool) if reorder else [pool]):
        seq = list(perm) + ([fixed_last] if fixed_last else [])
        n = len(seq)
        for cuts in itertools.product([0, 1], repeat=n - 1):
            rows, cur = [], [seq[0]]
            for k, c in zip(seq[1:], cuts, strict=True):
                if c:
                    rows.append(cur)
                    cur = [k]
                else:
                    cur.append(k)
            rows.append(cur)
            if any(len(r) > per_row for r in rows):
                continue
            if any((W - GAP * (len(r) - 1)) / sum(aspect(k) for k in r) * aspect(k) < 260 for r in rows for k in r if k != "crypto"):
                continue
            total = sum(row_h(r) for r in rows)
            if total > avail:
                continue
            minw = min((W - GAP * (len(r) - 1)) / sum(aspect(k) for k in r) * aspect(k) for r in rows for k in r if k != "crypto")
            score = (avail - total) - 0.2 * min(minw, 420)
            if best is None or score < best[0]:
                best = (score, rows, total)
    rows, total = best[1], best[2]
    global CRYPTO_ASPECT
    for r in rows:
        if "crypto" in r and len(r) > 1:
            # The card has no intrinsic shape: narrow it until its row takes the leftover height.
            others = sum(aspect(k) for k in r if k != "crypto")
            gaps = W - GAP * (len(r) - 1)
            h_now = gaps / (others + CRYPTO_ASPECT)
            target = h_now + (avail - total) - 4
            CRYPTO_ASPECT = max(0.55, min(3.0, gaps / target - others))
    print(f"layout {[len(r) for r in rows]} fill {total:.0f}/{avail}, crypto {CRYPTO_ASPECT:.2f}")
    return rows


CGAP = 18



def block_h(k, w):
    """Height of one item in a column of width w (figure: image plus caption; card: text estimate)."""
    if k == "crypto":
        # heading line per item, then the wrapped description (14.5 px text, ~20 px per line)
        return 95 + sum(20 * (1 + -(-int(len(d) * 1.1) // max(8, int((w - 70) / 7.0)))) + 8 for t, d in PRIVACY)
    return w / aspect(k) + caption_h(k, w) + ROWGAP


def col_h(ks, w):
    return sum(block_h(k, w) for k in ks)


def col_width(ks, avail):
    """Widest column width whose items still fit `avail` (heights grow with width)."""
    lo, hi = 150.0, float(W)
    for _ in range(40):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if col_h(ks, mid) <= avail else (lo, mid)
    return lo


def masonry(items, avail):
    """Split items (in order of appearance) into two columns whose widths fill the page width."""
    best = None
    for mask in range(1, 2 ** len(items) - 1):
        a = [k for i, k in enumerate(items) if mask >> i & 1]
        b = [k for i, k in enumerate(items) if not mask >> i & 1]
        if items[0] not in a:
            continue
        wa, wb = col_width(a, avail), col_width(b, avail)
        if col_h(a, wa) > avail or col_h(b, wb) > avail:
            continue
        slack = W - CGAP - wa - wb
        if slack < 0:  # too few items to fill the height at full width: shrink both, leave space below
            f = (W - CGAP) / (wa + wb)
            wa, wb = wa * f, wb * f
            waste = avail - max(col_h(a, wa), col_h(b, wb))
        else:
            waste = slack * 1.5
        score = waste + 3 * max(0, 480 - min(wa, wb))  # fill the page, but keep both columns readable
        if best is None or score < best[0]:
            best = (score, a, b, wa, wb)
    _, a, b, wa, wb = best
    slack = W - CGAP - wa - wb
    print(f"masonry {a} | {b} widths {wa:.0f}+{wb:.0f}, slack {slack:.0f}")
    return a, b, wa, wb


def masonry_md(items, avail):
    a, b, wa, wb = masonry(items, avail)
    col = lambda ks, w: f'<div class="mcol" style="width:{w:.0f}px">' + "".join(crypto(col=True) if k == "crypto" else fig(k, col=True) for k in ks) + "</div>"  # noqa: E731
    return '<div class="mcols">' + col(a, wa) + col(b, wb) + "</div>\n"


def fig(k, col=False):
    f, t, d, a = S[k]
    style = "" if col else f' style="flex:{aspect(k):.3f} 1 0"'
    return (f'<figure{style}><img src="{P}{f}">'
            f'<figcaption><b>{t}</b> · {d} – <em>{a}</em></figcaption></figure>')


PRIVACY = [
    ("Ende-zu-Ende verschlüsselt", "Namen, Scans, Punkte und Anmerkungen werden im Browser mit AES-256-GCM verschlüsselt, bevor sie gespeichert werden."),
    ("Schlüssel bleibt bei Ihnen", "Ein zufälliger 256-Bit-Schlüssel, freigeschaltet durch Ihr Passwort (Argon2id) oder Ihren Passkey. Er verlässt Ihr Gerät nie."),
    ("Server sieht nur Chiffretext", "Auch die Administration kann keine Noten oder Namen lesen; sie verwaltet nur Konten."),
    ("Anonym von Anfang an", "Bögen tragen ein Pseudonym im QR-Code; Namen erscheinen erst nach der Korrektur, entschlüsselt auf Ihrem Gerät."),
    ("Sie wählen den Speicherort", "Ergebnisse verschlüsselt auf dem Schulserver oder nur in diesem Browser."),
    ("Zwei Faktoren", "Anmeldung mit Passwort plus Authenticator-App oder Passkey."),
]


def crypto(col=False):
    style = "" if col else f' style="flex:{CRYPTO_ASPECT} 1 0"'
    items = "".join(f"<li><b>{t}</b> {d}</li>" for t, d in PRIVACY)
    return (f'<div class="card ok privacy"{style}><div class="algo">AES-256-GCM</div>'
            f'<ul>{items}</ul><p class="url">{URL}</p></div>')


def rows_md(rows):
    global CRYPTO_ASPECT
    md = "".join('<div class="jrow">' + "".join(crypto() if k == "crypto" else fig(k) for k in r) + "</div>\n" for r in rows)
    CRYPTO_ASPECT = 1.0
    return md
    return "".join('<div class="jrow">' + "".join(crypto() if k == "crypto" else fig(k) for k in r) + "</div>\n" for r in rows)


FM = f"""---
marp: true
theme: examance-poster
size: a3
paginate: false
header: '![](../screenshots/pitch/examance-logo.png) Examance <em>· {URL}</em>'
footer: 'Examance 0.2 (Beta) · Stand Oktober 2026 · Echte Oberfläche mit Demodaten, keine echten Schülerdaten'
---
"""
KICKED = 1538 - 180       # content bottom minus where the first row starts (measured in the PDF)
poster = (FM + '\n<!-- _class: tour -->\n\n<span class="kicker">Teil 1 · Erstellen</span>\n\n# Von der Aufgabe zur druckfertigen Klausur.\n\n'
          + masonry_md(["editor", "mc", "builder", "setup", "variantdiff", "proposal"], KICKED)
          + '\n---\n\n<!-- _class: tour -->\n\n<span class="kicker">Teil 2 · Korrigieren und auswerten</span>\n\n# Anonym bewerten, fair vergleichen.\n\n'
          + rows_md(layout(["grading", "mcreview", "paper", "results", "variant", "crypto"], KICKED, "crypto")))
(HERE / "examance-ui.md").write_text(poster)

DECK_FM = f"""---
marp: true
theme: examance
paginate: true
size: 16:9
header: '![](../screenshots/pitch/examance-logo.png) Examance <em>· {URL}</em>'
footer: 'Examance 0.2 (Beta) · Stand Oktober 2026 · Echte Oberfläche mit Demodaten, keine echten Schülerdaten'
---
"""


def shot_slide(k, part):
    f, t, d, a = S[k]
    return (f'\n---\n\n<!-- _class: shotslide -->\n\n<span class="kicker">{part}</span>\n\n## {t}\n\n'
            f'<figure><img src="{P}{f}"><figcaption>{d} – <em>{a}</em></figcaption></figure>\n')


def divider(n, title, lead):
    return (f'\n---\n\n<!-- _class: statement -->\n\n<span class="kicker">Teil {n}</span>\n\n# {title}\n\n'
            f'<p class="lead">{lead}</p>\n')


cards = "".join(f'<div class="card ok"><h3>{t}</h3><p class="small" style="margin:0">{d}</p></div>' for t, d in PRIVACY)
deck = (DECK_FM + f"""
<!-- _class: title -->
<!-- _paginate: false -->

<div class="cols center" style="grid-template-columns: 6fr 7fr">
<div>
<img class="logo" src="{P}examance-logo.png">
<span class="kicker">Rundgang durch die Oberfläche</span>

# Klausuren schreiben, setzen, fair bewerten.

<p class="lead">Aufgabenbibliothek, Klausursatz und Notenbuch in einem – im Browser, mit verschlüsselten Schülerdaten.</p>
</div>
<figure class="shot"><img src="{P}{S['setup'][0]}"><figcaption>Fertige Klausur mit Erwartungshorizont</figcaption></figure>
</div>
"""
        + divider(1, "Von der Aufgabe zur druckfertigen Klausur.", "Aufgaben einmal schreiben, in Minuten zur Klausur zusammenstellen, mit dem Kollegium teilen.")
        + "".join(shot_slide(k, "Teil 1 · Erstellen") for k in ["editor", "mc", "builder", "setup", "variantdiff", "proposal"])
        + divider(2, "Anonym bewerten, fair vergleichen.", "Auf Papier oder am Bildschirm korrigieren – beide Wege enden in derselben Auswertung.")
        + "".join(shot_slide(k, "Teil 2 · Korrigieren und auswerten") for k in ["paper", "grading", "mcreview", "results", "variant"])
        + f"""
---

<!-- _class: center -->

<span class="kicker">Datenschutz</span>

# Schülerdaten sind nur mit Ihrem Schlüssel lesbar.

<div class="cols3" style="margin-top:10px">{cards}</div>

<p class="lead" style="margin-top:18px">Ausprobieren: <strong>{URL}</strong> · Details zu Technik und Datenschutz in der Informationspräsentation.</p>
""")
(HERE.parent / "pitches" / "examance-ui.md").write_text(deck)
