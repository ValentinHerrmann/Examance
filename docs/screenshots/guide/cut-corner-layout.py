"""Writes the true-scale A4 sketch of the usable space with the cut-off corner (odd and even page) as LaTeX: `python3 cut-corner-layout.py de|en out.tex`."""

import math
import sys

# Mirrors Schulaufgabe.sty `schnittecke` and frontend lib/qr/cutCorner.ts; update together.
W, H = 210, 297
TAB_TOP, TAB_SIDE, TOL = 75, 20, 3
HYP = math.hypot(TAB_TOP, TAB_SIDE)
ZT, ZS = TAB_TOP + TOL * HYP / TAB_SIDE, TAB_SIDE + TOL * HYP / TAB_TOP
TOP = 11.9
BODY = TOP + 30 / 72.27 * 25.4
BOTTOM = H - 14
PLAIN_TOP, PLAIN_AREA = 14.56, 190 * (283 - 14.56)
ANGLE = math.degrees(math.atan2(TAB_SIDE, TAB_TOP))

TEXT = {
    "de": {
        "odd": r"Ungerade Seiten (1, 3, 5, \dots): die Ecke oben rechts wird abgeschnitten",
        "even": r"Gerade Seiten (2, 4, 6, \dots): die Ecke oben links wird abgeschnitten, Kopfzeile gespiegelt",
        "content": "Inhalt (Textbereich)",
        "size": r"{w} $\times$ {h} mm, von x = 5 bis 205 mm und y = {top} bis {bottom} mm",
        "header": "Kopfzeile",
        "header_sub": r"{hh} mm hoch, von {top} bis {body} mm;\\ Texte 20 mm vom Papierrand",
        "title": "Titel",
        "page": "Seite X",
        "tab": "Abschnitt",
        "tol": "3 mm Toleranz",
        "table": "Punktetabelle (nur letzte Seite): 181 mm breit, unten bündig mit den Markierungen",
        "legend": "Legende",
        "items": [
            "Inhalt: Aufgaben, Lösungsfelder, Karos (Seite 1 auch QR-Feld und Hinweise)",
            "Kopfzeile: Logo, Titel, Datum, Klasse auf Seite 1; sonst Titel und Seitenzahl",
            "Punktetabelle (letzte Seite): 1,5 mm Abstand zu den Markierungen",
            "Abschnitt: auf Seite 1 Name und Schlüssel; wird auf jeder Seite abgeschnitten",
            "Schnitttoleranz: bleibt leer (Seite 1 trägt hier den kleinen Schnitthinweis)",
            "Eckmarkierungen für den Scan, 8 mm (frei halten)",
        ],
        "notes": [
            "Schnittlinie (gestrichelt): 75 mm entlang der Oberkante, 20 mm die Seite hinab; auf jeder Seite gedruckt.",
            r"Ohne die Option: 190 $\times$ 268,44 mm ab y = 14,56 mm; mit ihr {lower} mm tiefer, aber 10 mm breiter ({gain} \% Fläche).",
            "Der Textbereich bleibt rechteckig: Text kann nicht um Ecken einer Seite fließen.",
            "In Originalgröße auf A4 gezeichnet: Maße auf einem Ausdruck in 100 \\% sind echte Millimeter.",
        ],
    },
    "en": {
        "odd": r"Odd pages (1, 3, 5, \dots): the top-right corner is cut off",
        "even": r"Even pages (2, 4, 6, \dots): the top-left corner is cut off, header mirrored",
        "content": "Content (text area)",
        "size": r"{w} $\times$ {h} mm, from x = 5 to 205 mm and y = {top} to {bottom} mm",
        "header": "Header row",
        "header_sub": r"{hh} mm high, from {top} to {body} mm;\\ texts 20 mm from the paper edge",
        "title": "Title",
        "page": "Seite X",
        "tab": "Cut-off tab",
        "tol": "3 mm tolerance",
        "table": "Score table (last page only): 181 mm wide, bottom level with the markers",
        "legend": "Legend",
        "items": [
            "Content: tasks, answer fields, grids (page 1 also the QR box and info text)",
            "Header row: logo, title, date, class on page 1; else title and page number",
            "Score table (last page): 1.5 mm clear of the markers",
            "Cut-off tab: page 1 prints name and key here; cut away on every page",
            "Cut tolerance: stays empty (page 1 prints the small cut hint here)",
            "Corner markers for scanning, 8 mm (keep clear)",
        ],
        "notes": [
            "Cut line (dashed): 75 mm along the top edge, 20 mm down the side; printed on every page.",
            r"Without the option: 190 $\times$ 268.44 mm from y = 14.56 mm; with it {lower} mm lower but 10 mm wider ({gain} \% area).",
            "The text area stays rectangular: text cannot flow around the corners of a page.",
            "Drawn at true scale on A4: measurements on a 100 \\% print are real millimetres.",
        ],
    },
}
COLOURS = ["green!22", "blue!22", "violet!30", "orange!40", "red!35", "black"]


def num(v: float, lang: str) -> str:
    s = f"{v:.2f}"
    return s.replace(".", ",") if lang == "de" else s


def zone_width(y: float) -> float:
    """Zone width from the cut side at depth *y*."""
    return ZT * (1 - y / ZS)


def page(odd: bool, lang: str) -> str:
    t = TEXT[lang]
    n = lambda v: num(v, lang)  # noqa: E731
    mirror = (lambda x: x) if odd else (lambda x: W - x)
    P = lambda x, y: f"({mirror(x):.2f},{y:.2f})"  # noqa: E731
    near, far = ("north west", "north east") if odd else ("north east", "north west")
    rot = f"{'-' if odd else ''}{ANGLE:.1f}"
    o = [r"\begin{tikzpicture}[remember picture,overlay,x=1mm,y=-1mm,shift={(current page.north west)}]"]
    o.append(rf"\fill[green!22] {P(5, BODY)} rectangle {P(205, BOTTOM)};")
    o.append(rf"\fill[blue!22] {P(5, TOP)} -- {P(W - zone_width(TOP), TOP)} -- {P(W - zone_width(BODY), BODY)} -- {P(5, BODY)} -- cycle;")
    o.append(rf"\fill[violet!30] {P(14.5, BOTTOM - 12)} rectangle {P(195.5, 292)};")
    o.append(rf"\draw[violet!70,dashed] {P(14.5, BOTTOM - 12)} rectangle {P(195.5, 292)};")
    o.append(rf"\fill[orange!40] {P(W - TAB_TOP, 0)} -- {P(W, 0)} -- {P(W, TAB_SIDE)} -- cycle;")
    o.append(rf"\fill[red!35] {P(W - ZT, 0)} -- {P(W - TAB_TOP, 0)} -- {P(W, TAB_SIDE)} -- {P(W, ZS)} -- cycle;")
    o.append(rf"\draw[dashed,thick,black!60] {P(W - TAB_TOP, 0)} -- {P(W, TAB_SIDE)};")
    for x, y in [(5, 12), (W - 54, 12), (5, 284), (W - 13, 284)]:
        o.append(rf"\fill[black] {P(x, y)} rectangle {P(x + 8, y + 8)}; \fill[white] {P(x + 1.6, y + 1.6)} rectangle {P(x + 6.4, y + 6.4)}; \fill[black] {P(x + 2.8, y + 2.8)} rectangle {P(x + 5.2, y + 5.2)};")
    o.append(rf"\node[anchor={near},font=\scriptsize\bfseries,blue!60!black] at {P(15, TOP + 0.6)} {{{t['header']}}};")
    o.append(rf"\node[anchor={near},font=\tiny,blue!60!black,align={'left' if odd else 'right'}] at {P(15, TOP + 3.6)} {{{t['header_sub'].format(hh=n(BODY - TOP), top=n(TOP), body=n(BODY))}}};")
    o.append(rf"\node[anchor={'south east' if odd else 'south west'},font=\footnotesize,blue!60!black] at {P(W - 20, BODY - 0.8)} {{{t['page']}}};")
    o.append(rf"\node[anchor={'south west' if odd else 'south east'},font=\footnotesize,blue!60!black] at {P(80, BODY - 0.8)} {{{t['title']}}};")
    o.append(rf"\node[font=\scriptsize\bfseries,orange!50!black,rotate={rot}] at {P(W - TAB_TOP * 0.45, TAB_SIDE * 0.45 - 2.5)} {{{t['tab']}}};")
    o.append(rf"\node[font=\tiny,red!60!black,rotate={rot}] at {P(W - TAB_TOP * 0.8 + 1.3, TAB_SIDE * 0.2 + 1.3)} {{{t['tol']}}};")
    o.append(rf"\node[anchor=north,font=\Large\bfseries,green!40!black] at {P(105, BODY + 18)} {{{t['content']}}};")
    o.append(rf"\node[anchor=north,font=\small,green!40!black] at {P(105, BODY + 26)} {{{t['size'].format(w=n(200), h=n(BOTTOM - BODY), top=n(BODY), bottom=n(BOTTOM))}}};")
    o.append(rf"\node[anchor=north,font=\small\itshape] at {P(105, BODY + 35)} {{{t['odd' if odd else 'even']}}};")
    o.append(rf"\node[font=\scriptsize\bfseries,violet!60!black] at {P(105, BOTTOM - 6)} {{{t['table']}}};")
    for y in (TOP, BODY, BOTTOM):
        o.append(rf"\draw[black!50] {P(0, y)} -- {P(3, y)}; \node[anchor={'west' if odd else 'east'},font=\tiny,black!60] at {P(14 if y == TOP else 1, y + (1.6 if y == BODY else -1.2))} {{y = {n(y)} mm}};")
    o.append(rf"\node[anchor=north,font=\tiny,red!60!black] at {P(W - ZT / 2 - 6, 0.3)} {{{n(ZT)} mm}};")
    o.append(rf"\node[anchor={'east' if odd else 'west'},font=\tiny,red!60!black] at {P(W - 0.5, ZS + 1.8)} {{{n(ZS)} mm}};")
    x0, ly = (40 if odd else W - 170), BODY + 52
    o.append(rf"\node[anchor=north west,font=\small\bfseries] at ({x0},{ly - 7}) {{{t['legend']}}};")
    for i, (c, label) in enumerate(zip(COLOURS, t["items"], strict=True)):
        y = ly + i * 7
        o.append(rf"\fill[{c}] ({x0},{y}) rectangle ({x0 + 6},{y + 4.5}); \draw[black!40] ({x0},{y}) rectangle ({x0 + 6},{y + 4.5}); \node[anchor=west,font=\footnotesize] at ({x0 + 8},{y + 2.25}) {{{label}}};")
    gain = n(200 * (BOTTOM - BODY) / PLAIN_AREA * 100 - 100)
    for i, note in enumerate(t["notes"]):
        o.append(rf"\node[anchor=west,font=\footnotesize\itshape,black!70] at ({x0},{ly + 48 + i * 5.5}) {{{note.format(lower=n(BODY - PLAIN_TOP), gain=gain)}}};")
    o.append(r"\end{tikzpicture}\null\newpage")
    return "\n".join(o)


if __name__ == "__main__":
    lang, out = sys.argv[1], sys.argv[2]
    head = "\\documentclass{article}\n\\usepackage[a4paper,margin=0mm]{geometry}\n\\usepackage{tikz}\n\\pagestyle{empty}\\parindent0pt\n\\begin{document}\n"
    with open(out, "w", encoding="utf-8") as f:
        f.write(head + page(True, lang) + "\n" + page(False, lang) + "\n\\end{document}\n")
