"""Writes the UI tour poster sources (examance-ui-tour.md, examance-ui-tour-2p.md).
Images sit in justified rows: each figure's flex-grow is its aspect ratio. Run from anywhere."""
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
P = "../screenshots/pitch/"
URL = "examance.valentin-herrmann.com"
S = {
    "editor": ("tour/t-exercise-editor.jpg", "LaTeX-Aufgabeneditor", "Bausteine per Klick, Vorschau von Aufgabe und Lösung", "druckreif ohne LaTeX-Kenntnisse"),
    "editor-tight": ("tour/t-exercise-editor-tight.jpg", "LaTeX-Aufgabeneditor", "Bausteine per Klick, Vorschau von Aufgabe und Lösung", "druckreif ohne LaTeX-Kenntnisse"),
    "mc": ("tour/t-mc-editor.jpg", "Multiple Choice", "Optionen eintippen, richtige anhaken, Punktabzug wählen", "Kreuze werden später automatisch gelesen"),
    "builder": ("tour/t-exam-builder.jpg", "Klausur zusammenstellen", "Aufgaben und Varianten anhaken", "in Minuten statt Stunden"),
    "setup": ("tour/t-exam-setup.jpg", "Fertige Klausur", "Prüfung und Erwartungshorizont als PDF", "sofort druckbar, auch für Papierkorrektur"),
    "library": ("tour/t-library.jpg", "Aufgabenbibliothek", "nach Thema, Klasse, Fach; Varianten und Versionen", "einmal schreiben, immer wiederverwenden"),
    "proposal": ("tour/t-proposal.jpg", "Teilen & Vorschläge", "Kollegium schlägt Änderungen vor, die Autorin entscheidet", "gemeinsamer Aufgabenpool der Fachschaft"),
    "grading": ("tour/t-grading.jpg", "Anonym korrigieren", "QR-Aufkleber statt Name; Aufgabe für Aufgabe, Stempel direkt im Scan", "fair, ohne Halo-Effekt"),
    "mcreview": ("tour/t-mc-review.jpg", "MC-Erkennung", "richtig, falsch, leer, zurückgenommen und neu gesetzt; Unsicheres wird markiert", "Sie entscheiden im Zweifel"),
    "paper": ("tour/t-paper-entry.jpg", "Papierkorrektur", "Punkte tippen oder aus Excel einfügen", "Auswertung auch ohne Scanner"),
    "results": ("tour/t-results.jpg", "Ergebnisse", "Notenspiegel, Schnitt, Grenzfälle", "fertig, sobald die Punkte da sind"),
    "variant": ("09b-variant-comparison.jpg", "Variantenvergleich", "Gruppe B 24 Prozentpunkte schwächer", "unfaire Varianten fallen auf"),
}


def fig(k):
    f, t, d, a = S[k]
    im = Image.open(HERE / P / f)
    return (f'<figure style="flex:{im.width / im.height:.3f} 1 0"><img src="{P}{f}">'
            f'<figcaption><b>{t}</b> · {d} – <em>{a}</em></figcaption></figure>')


def row(*ks, extra=""):
    return '<div class="jrow">' + "".join(fig(k) for k in ks) + extra + "</div>\n"


def crypto(flex=None):
    style = f' style="flex:{flex} 1 0"' if flex else ' style="margin-top:14px"'
    return (f'<div class="card ok"{style}><div class="algo">AES-256-GCM</div>'
            '<p style="margin:0;font-size:15px">Namen, Scans und Punkte werden <b>im Browser</b> verschlüsselt '
            '(Ende-zu-Ende). Der Schlüssel entsteht aus Ihrem Passwort (Argon2id) und verlässt Ihr Gerät nie – '
            'der Server sieht nur Chiffretext. Anmeldung mit zweitem Faktor.</p>'
            f'<p class="url">{URL}</p></div>')


FM = f"""---
marp: true
theme: examance-poster
size: a3
paginate: false
header: '![](../screenshots/pitch/examance-logo.png) Examance <em>· {URL}</em>'
footer: 'Examance 0.2 (Beta) · Stand Oktober 2026 · Echte Oberfläche mit Demodaten, keine echten Schülerdaten'
---
"""
one = (FM + "\n# Klausuren schreiben, setzen, fair bewerten.\n\n"
       + row("editor-tight", "mc") + row("setup", "grading", "paper") + row("mcreview", extra=crypto(1.05))
       + row("results", "variant", "proposal"))
two = (FM + '\n<span class="kicker">Teil 1 · Erstellen</span>\n\n# Von der Aufgabe zur druckfertigen Klausur.\n\n'
       + row("editor", "mc") + row("builder", "setup") + row("library", "proposal")
       + '\n---\n\n<span class="kicker">Teil 2 · Korrigieren und auswerten</span>\n\n# Anonym bewerten, fair vergleichen.\n\n'
       + row("mcreview") + row("grading", "paper") + row("results", "variant") + crypto())
(HERE / "examance-ui-tour.md").write_text(one)
(HERE / "examance-ui-tour-2p.md").write_text(two)
