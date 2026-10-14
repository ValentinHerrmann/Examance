"""Writes the SVG diagrams of the information deck and poster (docs/pitches/examance-info.md,
docs/posters/examance-info.md). Every statement must match docs/data_flow_and_security.md. Run from anywhere."""
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent

# Print palette of docs/posters/examance-poster.css: readable on screen and on office printers.
C = {
    "text": "#f4f6f8", "muted": "#c9d1da", "line": "#6b7785", "box": "#1c2128",
    "accent": "#9cc8f0", "ok": "#2ee6b0", "okbox": "#12271f", "okline": "#1d8a66",
    "warn": "#ffb733", "warnbox": "#2a2214", "warnline": "#8a6418",
    "key": "#1a2530", "keyline": "#4f7aa3", "bad": "#ff9e94", "panel": "#16191d",
}
FONT = "Inter, 'Segoe UI', system-ui, sans-serif"
KIND = {  # fill, stroke, title colour
    None: (C["box"], C["line"], C["text"]),
    "key": (C["key"], C["keyline"], C["accent"]),
    "ok": (C["okbox"], C["okline"], C["ok"]),
    "warn": (C["warnbox"], C["warnline"], C["warn"]),
}


class Svg:
    def __init__(self, w, h):
        self.w, self.h, self.out = w, h, []

    def text(self, x, y, s, size=16, color=None, weight=400, anchor="start", italic=False, halo=False):
        style = ' font-style="italic"' if italic else ""
        if halo:  # keeps labels readable where they cross lines
            style += f' stroke="{C["panel"]}" stroke-width="6" paint-order="stroke" stroke-linejoin="round"'
        self.out.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color or C["muted"]}" font-weight="{weight}" '
                        f'text-anchor="{anchor}"{style}>{escape(s)}</text>')

    def box(self, x, y, w, h, title, lines=(), kind=None, size=15, center=False):
        fill, stroke, tc = KIND[kind]
        self.out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')
        tx, anchor = (x + w / 2, "middle") if center else (x + 16, "start")
        self.text(tx, y + 28, title, 18, tc, 650, anchor)
        for i, line in enumerate(lines):
            self.text(tx, y + 54 + i * (size + 6), line, size, C["muted"], 400, anchor)

    def zone(self, x, y, w, h, label, kind=None):
        stroke = {"ok": C["okline"], "key": C["keyline"], None: C["line"]}[kind]
        color = {"ok": C["ok"], "key": C["accent"], None: C["muted"]}[kind]
        self.out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="16" fill="none" stroke="{stroke}" '
                        f'stroke-width="2" stroke-dasharray="8 6"/>')
        self.text(x + 16, y + 26, label, 15, color, 700)

    def arrow(self, pts, label=None, color=None, dashed=False, lx=None, ly=None, anchor="middle", both=False):
        color = color or C["accent"]
        d = "M" + " L".join(f"{x},{y}" for x, y in pts)
        dash = ' stroke-dasharray="6 5"' if dashed else ""
        mk = color.strip("#")
        start = f' marker-start="url(#s{mk})"' if both else ""
        self.out.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="2.4"{dash} marker-end="url(#a{mk})"{start}/>')
        if label:
            (x1, y1), (x2, y2) = pts[0], pts[-1]
            self.text(lx if lx is not None else (x1 + x2) / 2, ly if ly is not None else (y1 + y2) / 2 - 8,
                      label, 14, C["muted"], 500, anchor, halo=True)

    def write(self, name):
        markers = "".join(
            f'<marker id="a{c.strip("#")}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
            f'<path d="M0,0 L10,5 L0,10 z" fill="{c}"/></marker>'
            f'<marker id="s{c.strip("#")}" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
            f'<path d="M10,0 L0,5 L10,10 z" fill="{c}"/></marker>'
            for c in {C["accent"], C["ok"], C["warn"], C["muted"], C["bad"]})
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" width="{self.w}" height="{self.h}" '
               f'font-family="{FONT}"><defs>{markers}</defs>'
               f'<rect width="{self.w}" height="{self.h}" rx="16" fill="{C["panel"]}"/>' + "".join(self.out) + "</svg>\n")
        (HERE / f"{name}.svg").write_text(svg)


def sequence(name, w, actors, steps, top=20, row=46):
    """Sequence chart: actors are (label, kind); steps are ("msg", a, b, text[, color]), ("self", a, text)
    or ("note", text, kind). Columns are evenly spaced."""
    n = len(actors)
    colw = w / n
    xs = [colw * (i + 0.5) for i in range(n)]
    h = top + 70 + sum(row + (14 if s[0] == "note" else 0) for s in steps) + 20
    s = Svg(w, h)
    for (label, kind), x in zip(actors, xs, strict=True):
        s.box(x - 130, top, 260, 46, label, kind=kind, center=True)
        s.out.append(f'<line x1="{x}" y1="{top + 46}" x2="{x}" y2="{h - 10}" stroke="{C["line"]}" stroke-width="2" stroke-dasharray="4 5"/>')
    y = top + 92
    for i, st in enumerate(steps, 1):
        if st[0] == "note":
            fill, stroke, tc = KIND[st[2]]
            s.out.append(f'<rect x="{xs[0] - 120}" y="{y - 24}" width="{xs[-1] - xs[0] + 240}" height="{row + 4}" rx="10" '
                         f'fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>')
            s.text(w / 2, y + 5, st[1], 16, tc, 600, "middle")
            y += row + 14
            continue
        s.out.append(f'<circle cx="{26}" cy="{y - 5}" r="12" fill="{C["key"]}" stroke="{C["keyline"]}"/>')
        s.text(26, y, str(i), 13, C["accent"], 700, "middle")
        if st[0] == "msg":
            _, a, b, label, *col = st
            xa, xb = xs[a], xs[b]
            s.arrow([(xa + (6 if xb > xa else -6), y + 6), (xb - (8 if xb > xa else -8), y + 6)], color=col[0] if col else None)
            s.text((xa + xb) / 2, y - 4, label, 15, C["text"], 500, "middle", halo=True)
        else:
            _, a, label = st
            x = xs[a]
            s.out.append(f'<rect x="{x - 8}" y="{y - 20}" width="16" height="30" rx="3" fill="{C["key"]}" stroke="{C["keyline"]}"/>')
            s.text(x + 18, y, label, 15, C["text"], 500, halo=True)
        y += row
    s.write(name)


def pipeline():
    s = Svg(1400, 402)
    W, step = 205, 232
    x = [12 + i * step for i in range(6)]
    s.box(x[0], 20, W, 150, "Aufgabe", ["LaTeX aus der Bibliothek", "jedes \\BE = ein Punkt", "Varianten A/B"])
    s.box(x[1], 20, W, 150, "Klausur setzen", ["XeLaTeX im Browser (WASM)", "oder Tectonic auf dem", "Server, falls erlaubt"])
    s.box(x[2], 20, W, 150, "Drucken, schreiben", ["QR-Code mit Pseudonym", "und Passmarken –", "kein Name auf dem Bogen"])
    s.box(x[3], 20, x[4] + W - x[3], 150, "Weg A · Auf Papier korrigieren", ["Rotstift wie gewohnt; Punkte je Aufgabe", "eintippen oder aus Excel einfügen"])
    s.box(x[2], 240, W, 150, "Scannen", ["ein PDF für den", "ganzen Stapel,", "Schulkopierer genügt"])
    s.box(x[3], 240, W, 150, "Zuordnen", ["QR-Codes lesen, Seiten", "sortieren; Unlesbares", "kommt in eine Prüfliste"])
    s.box(x[4], 240, W, 150, "Korrigieren", ["anonym, mit Stempeln;", "MC-Kreuze gelesen,", "Unsicheres vorgelegt"])
    s.box(x[5], 20, W, 370, "Ergebnisse", ["Namen erst jetzt –", "im Browser entschlüsselt", "", "Notenspiegel,", "Grenzfälle,", "Variantenvergleich,", "Aufgabenqualität,", "Export"], kind="ok")
    for i in (0, 1):
        s.arrow([(x[i] + W + 2, 95), (x[i + 1] - 4, 95)])
    s.arrow([(x[2] + W + 2, 95), (x[3] - 4, 95)])
    s.arrow([(x[4] + W + 2, 95), (x[5] - 4, 95)])
    s.arrow([(x[2] + W / 2, 172), (x[2] + W / 2, 236)], "Weg B", lx=x[2] + W / 2 + 10, ly=210, anchor="start")
    s.arrow([(x[2] + W + 2, 315), (x[3] - 4, 315)])
    s.arrow([(x[3] + W + 2, 315), (x[4] - 4, 315)])
    s.arrow([(x[4] + W + 2, 315), (x[5] - 4, 315)])
    s.box(x[0], 240, x[1] + W - x[0], 150, "Im Browser verschlüsselt", ["Scans, Namen, Anmerkungen und", "Einzelpunkte werden verschlüsselt,", "bevor sie gespeichert werden"], "ok")
    s.write("pipeline")


def key_hierarchy():
    s = Svg(1400, 600)
    s.zone(10, 10, 960, 580, "BROWSER DER LEHRKRAFT – hier entstehen und leben alle Schlüssel", "ok")
    s.zone(1000, 10, 390, 580, "SERVER – speichert nur Chiffrat")
    fx, fw = 34, 270
    s.box(fx, 56, fw, 78, "Passwort", ["Argon2id + HKDF"], "key")
    s.box(fx, 148, fw, 78, "Passkey", ["PRF-Erweiterung + HKDF"], "key")
    s.box(fx, 240, fw, 78, "Wiederherstellungscode", ["auf Papier · Argon2id + HKDF"], "key")
    s.box(360, 56, 262, 262, "Je Faktor ein KEK", ["Schlüssel-Verschlüs-", "selungsschlüssel", "", "Argon2id: t=3, 64 MB,", "p=4, eigener Salt", "je Faktor"])
    for y in (95, 187, 279):
        s.arrow([(fx + fw + 2, y), (356, y)])
    s.box(700, 110, 250, 150, "Datenschlüssel", ["zufällige 32 Byte,", "je Faktor einmal", "verpackt (AES-GCM)"], "ok")
    s.arrow([(624, 185), (696, 185)], "(ent)packt", ly=172)
    s.box(1024, 96, 342, 178, "Schlüsselverpackungen", ["je Faktor: verpackter", "Datenschlüssel, Salt,", "KDF-Parameter; an Konto", "und Faktor gebunden"])
    s.arrow([(952, 160), (1020, 160)], "speichern", ly=150)
    s.arrow([(1020, 215), (952, 215)], "laden", ly=238)
    # session key and record encryption
    s.box(34, 380, 250, 130, "Sitzungs-Nonce", ["aus der E-Mail-Adresse", "abgeleitet (kein", "Geheimnis, nur Salt)"])
    s.box(340, 380, 280, 130, "Sitzungsschlüssel", ["HKDF-SHA-256; lebt nur", "in diesem Tab, gelöscht", "bei Sperre und Inaktivität"], "key")
    s.box(680, 380, 270, 130, "AES-256-GCM", ["frischer 12-Byte-IV", "pro Vorgang"], "key")
    s.arrow([(825, 262), (825, 340), (480, 340), (480, 376)])
    s.arrow([(286, 445), (336, 445)])
    s.arrow([(622, 445), (676, 445)])
    s.box(1024, 360, 342, 170, "Datensätze", ["Namen, Scans, Anmerkungen,", "Einzelpunkte, MC-Daten:", "nur als Chiffrat (Hybrid:", "nur in IndexedDB)"], "ok")
    s.arrow([(952, 445), (1020, 445)], "Chiffrat", ly=435)
    s.text(500, 568, "Passwort-Reset durch Admin: Die Passwort-Verpackung wird ungültig, nur der Wiederherstellungscode öffnet die Daten wieder.",
           15, C["warn"], 600, "middle")
    s.write("key-hierarchy")


def sign_in():
    sequence("sign-in", 1300, [("Lehrkraft", None), ("Browser", "ok"), ("Server", None)], [
        ("msg", 0, 1, "E-Mail und erster Faktor (Passwort oder Passkey)"),
        ("msg", 1, 2, "ersten Faktor prüfen"),
        ("msg", 2, 1, "erst jetzt: welche Faktoren fehlen; Einmal-Token, 10 Minuten"),
        ("msg", 0, 1, "zweiter Faktor (Authenticator-Code oder Passkey)"),
        ("msg", 1, 2, "zweiten Faktor gegen das Konto im Token prüfen"),
        ("msg", 2, 1, "Sitzung + verpackter Datenschlüssel (Chiffrat)"),
        ("self", 1, "KEK ableiten, Datenschlüssel entpacken, Fingerabdruck prüfen"),
        ("note", "Passkey (mit PIN oder Biometrie) genügt allein – sonst zwei von drei: Passwort, Authenticator-App, Passkey", "key"),
        ("note", "Fehlversuche sperren das Konto zeitweise · kein Endpunkt verrät, welche Faktoren eine Adresse hat", None),
    ])


def pseudonym():
    sequence("pseudonym", 1300, [("Browser der Lehrkraft", "ok"), ("Papier und Kopierer", None), ("Server", None)], [
        ("self", 0, "Schülerliste: je Person ein zufälliges Pseudonym"),
        ("msg", 0, 2, "Name, Nummer verschlüsselt; Kennung = Hash des Pseudonyms"),
        ("msg", 0, 1, "Klausur-PDF: QR mit Pseudonym, Variante, Ersatzcode"),
        ("msg", 1, 0, "ein Scan-PDF für den ganzen Stapel"),
        ("self", 0, "QR lesen, Seiten zuordnen, Kreuze messen (Web Worker)"),
        ("self", 0, "korrigieren: „Anonymer Schüler #7 von 26“"),
        ("msg", 0, 2, "Scan, Anmerkungen, Einzelpunkte als Chiffrat; Gesamtpunktzahl"),
        ("self", 0, "danach: Namen im Browser entschlüsseln und zuordnen"),
        ("note", "Pseudonym ist nicht anonym: Wer den Schlüssel hat, kann zuordnen – die DSGVO gilt voll", "warn"),
    ])


def what_server_sees():
    s = Svg(1400, 470)
    cols = [
        ("Nur als Chiffrat auf dem Server", "ok", "AES-256-GCM, Schlüssel nur im Browser", [
            "Namen und Schülernummern", "Scans der Arbeiten", "Anmerkungen der Korrektur",
            "Punkte je Aufgabe, MC-Kreuze,", "  Erkennungsdaten", "Im Hybrid-Modus: gar nicht", "  auf dem Server"]),
        ("Lesbar auf dem Server", "warn", "nötig für Bibliothek, Satz und Konto", [
            "Aufgaben- und Klausurtexte (LaTeX)", "  samt Dateien der Aufgaben", "Klausurdaten: Titel, Klasse, Fach,",
            "  Datum, Nachname der Lehrkraft", "Gesamtpunktzahl je Abgabe (pseudonym)", "E-Mail, Rolle, Freischaltungen",
            "Passwort nur als Argon2id-Hash"]),
        ("Nie auf dem Server", "key", "bleibt beim Menschen oder im Browser", [
            "Datenschlüssel und Sitzungsschlüssel", "Wiederherstellungscode", "Zuordnung Pseudonym → Name",
            "  im Klartext", "Im Hybrid-Modus: Schülerdaten,", "  Scans und Punkte"]),
    ]
    w = 448
    for i, (title, kind, sub, lines) in enumerate(cols):
        x = 12 + i * (w + 16)
        fill, stroke, tc = KIND[kind]
        s.out.append(f'<rect x="{x}" y="10" width="{w}" height="450" rx="14" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')
        s.text(x + 22, 48, title, 22, tc, 700)
        s.text(x + 22, 76, sub, 15, C["muted"], 500, italic=True)
        y = 120
        for line in lines:
            if line.startswith("  "):
                s.text(x + 44, y, line.strip(), 17, C["text"])
            else:
                s.out.append(f'<circle cx="{x + 30}" cy="{y - 6}" r="4.5" fill="{tc}"/>')
                s.text(x + 44, y, line, 17, C["text"])
            y += 44 if not line.startswith("  ") and False else 40
    s.write("what-server-sees")


def storage_modes():
    s = Svg(1400, 470)
    for i, (title, results_where, note) in enumerate([
        ("Server-Modus (all-server)", "server", "mehrere Geräte · Sicherung auf dem Server · von der Administration freizugeben"),
        ("Hybrid-Modus", "browser", "ein Browser · Sicherung als verschlüsseltes Archiv · private Geräte: Landesrecht prüfen"),
    ]):
        x0 = 12 + i * 700
        s.zone(x0, 10, 676, 330, title.upper(), "key")
        s.box(x0 + 24, 56, 290, 200, "Browser", ["Schlüssel, Satz, Scan-", "verarbeitung, Auswertung"]
              + (["", "Ergebnisse: nur hier,", "verschlüsselt (IndexedDB)"] if results_where == "browser" else ["", "nur Zwischenspeicher,", "beim Sperren gelöscht"]),
              "ok")
        s.box(x0 + 362, 56, 290, 200, "Server", ["Aufgaben, Klausuren"]
              + (["Ergebnisse als Chiffrat:", "Namen, Scans, Punkte", "+ Gesamtpunktzahl"] if results_where == "server" else ["", "keine Schülerdaten,", "keine Scans, keine Punkte"]))
        s.arrow([(x0 + 318, 156), (x0 + 356, 156)], both=True)
        s.text(x0 + 24, 290, note, 15, C["muted"], 500)
        s.text(x0 + 24, 318, "Der Modus gehört zum Konto und gilt für alle seine Browser.", 15, C["muted"], 500)
    s.text(12, 380, "Wechsel = Umzug der Ergebnisse:", 18, C["text"], 650)
    steps = ["je Klausur kopieren", "Anzahl prüfen", "erst dann Modus umstellen", "alte Kopie behalten oder löschen"]
    x = 12
    for j, st in enumerate(steps):
        w = 20 + len(st) * 9.6
        s.box(x, 400, w, 50, st, center=True)
        if j < len(steps) - 1:
            s.arrow([(x + w + 4, 425), (x + w + 40, 425)])
        x += w + 46
    s.write("storage-modes")


def roles():
    s = Svg(1400, 430)
    s.box(12, 10, 440, 410, "Administration", [
        "Registrierungen freigeben, einladen", "Schul-Domains automatisch freischalten",
        "pro Konto schalten:", "  · Ergebnisse auf dem Server", "  · LaTeX-Satz auf dem Server", "  · Aufgaben teilen",
        "Konten löschen, Passwort zurücksetzen", "", "kein Zugriff auf Klausuren,", "Aufgaben oder Ergebnisse"], size=16)
    s.box(948, 10, 440, 410, "Lehrkraft", [
        "eigene Aufgaben und Klausuren", "Schülerdaten, Scans, Punkte –", "entschlüsselt nur im eigenen Browser",
        "Speicher-Modus wählen", "", "Aufgaben teilen (nur Aufgabentexte,", "nach Pflichtbestätigung; nie Klausuren,",
        "Scans oder Ergebnisse)", "", "Wiederherstellungscode auf Papier"], "ok", size=16)
    s.box(500, 240, 400, 140, "Datenbank", ["Schülerdaten nur als Chiffrat –", "auch per Direktzugriff unlesbar"])
    s.box(500, 60, 400, 140, "Unterrichts-Schnittstellen", ["Klausuren, Aufgaben, Ergebnisse;", "Admin-Konten werden abgelehnt", "(403 ERR_TEACHER_ROLE_REQUIRED)"], "warn")
    s.arrow([(454, 150), (496, 150)], "403", color=C["bad"], ly=140)
    s.arrow([(946, 150), (904, 150)], color=C["ok"])
    s.arrow([(454, 310), (496, 310)], "nur Chiffrat", color=C["bad"], dashed=True, lx=475, ly=345)
    s.arrow([(700, 202), (700, 236)], color=C["muted"])
    s.write("roles")


def deployment():
    s = Svg(1400, 430)
    s.zone(10, 10, 330, 410, "GERÄT DER LEHRKRAFT", "ok")
    s.box(34, 56, 282, 200, "Browser", ["Svelte-App, läuft vollständig", "lokal: Verschlüsselung,", "LaTeX (WASM), QR, MC-", "Erkennung, Statistik"], "ok")
    s.box(34, 280, 282, 120, "IndexedDB", ["Hybrid: Ergebnisse", "verschlüsselt"], "ok")
    s.box(400, 40, 300, 120, "Statisches Hosting", ["liefert nur die App-Dateien", "(z. B. CDN oder Schulserver)"])
    s.zone(760, 10, 630, 410, "SERVER · Docker Compose")
    s.box(784, 56, 240, 110, "Caddy", ["TLS, Reverse Proxy"])
    s.box(1100, 56, 266, 140, "FastAPI-Backend", ["REST /api/v1;", "optional Tectonic"], "key")
    s.box(784, 230, 240, 120, "PostgreSQL", ["Chiffrat + Bibliothek,", "keine offenen Ports"])
    s.box(1100, 230, 266, 120, "Redis", ["Anmeldesperren, Zähler", "(kurzlebig); keine offenen Ports"])
    s.text(784, 396, "+ täglicher Aufbewahrungslauf löscht abgelaufene Daten", 15, C["muted"], 500)
    s.arrow([(318, 110), (396, 100)], "App laden", ly=92)
    s.arrow([(318, 210), (740, 210), (740, 130), (780, 130)], "HTTPS /api/v1 – Schülerdaten nur als Chiffrat", lx=530, ly=236)
    s.arrow([(1026, 110), (1096, 110)])
    s.arrow([(1130, 198), (1010, 226)])
    s.arrow([(1233, 198), (1233, 226)])
    s.arrow([(175, 258), (175, 276)], color=C["muted"])
    s.write("deployment")


if __name__ == "__main__":
    for f in (pipeline, key_hierarchy, sign_in, pseudonym, what_server_sees, storage_modes, roles, deployment):
        f()
