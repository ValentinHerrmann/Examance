"""Prints the true-scale A4 sketch of the usable space on an exam page (odd and even) as LaTeX: `python3 cut-corner-layout.py de|en > out.tex`."""

import math
import sys
from dataclasses import dataclass

# Mirrors Schulaufgabe.sty and frontend lib/qr/cutCorner.ts; update together.
W, H = 210, 297
TAB_TOP, TAB_SIDE, TOL = 75, 20, 3
HYP = math.hypot(TAB_TOP, TAB_SIDE)
ZT, ZS = TAB_TOP + TOL * HYP / TAB_SIDE, TAB_SIDE + TOL * HYP / TAB_TOP
TOP = 11.9
BODY = TOP + 30 / 72.27 * 25.4
BOTTOM = H - 14
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
            "Kopfzeile: Logo, Titel, Datum $\\cdot$ Klasse $\\cdot$ Lehrkraft auf Seite 1; sonst Titel und Seitenzahl",
            "Punktetabelle (letzte Seite): 1,5 mm Abstand zu den Markierungen",
            "Abschnitt: hellgrau; direkt bedruckte Exemplare tragen hier auf Seite 1 Name und Schlüssel",
            "Schnitttoleranz: bleibt immer leer",
            "Eckmarkierungen für den Scan, 8 mm (frei halten)",
        ],
        "notes": [
            "Schnittlinie mit Schere (nur auf direkt bedruckten Exemplaren): 75 mm entlang der Oberkante, 20 mm die Seite hinab.",
            "Jede Prüfung hat dieses Layout, auch ohne aufgedruckte QR-Codes.",
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
            "Header row: logo, title, date $\\cdot$ class $\\cdot$ teacher on page 1; else title and page number",
            "Score table (last page): 1.5 mm clear of the markers",
            "Cut-off tab: light grey; copies printed with the QR code carry name and key here on page 1",
            "Cut tolerance: always stays empty",
            "Corner markers for scanning, 8 mm (keep clear)",
        ],
        "notes": [
            "Cut line with scissors (only on copies printed with the QR code): 75 mm along the top edge, 20 mm down the side.",
            "Every exam has this layout, also without printed QR codes.",
            "The text area stays rectangular: text cannot flow around the corners of a page.",
            "Drawn at true scale on A4: measurements on a 100 \\% print are real millimetres.",
        ],
    },
}
COLOURS = ["green!22", "blue!22", "violet!30", "orange!40", "red!35", "black"]
MARKERS = [(5, 12), (W - 54, 12), (5, 284), (W - 13, 284)]


def zone_width(y: float) -> float:
    """Zone width from the cut side at depth *y*."""
    return ZT * (1 - y / ZS)


@dataclass
class Page:
    """One sketch page: odd pages cut the top-right corner, even pages are mirrored."""

    odd: bool
    lang: str

    def n(self, v: float) -> str:
        s = f"{v:.2f}"
        return s.replace(".", ",") if self.lang == "de" else s

    def p(self, x: float, y: float) -> str:
        return f"({x if self.odd else W - x:.2f},{y:.2f})"

    def areas(self) -> list[str]:
        p = self.p
        return [
            rf"\fill[green!22] {p(5, BODY)} rectangle {p(205, BOTTOM)};",
            rf"\fill[blue!22] {p(5, TOP)} -- {p(W - zone_width(TOP), TOP)} -- {p(W - zone_width(BODY), BODY)} -- {p(5, BODY)} -- cycle;",
            rf"\fill[violet!30] {p(14.5, BOTTOM - 12)} rectangle {p(195.5, 292)};",
            rf"\draw[violet!70,dashed] {p(14.5, BOTTOM - 12)} rectangle {p(195.5, 292)};",
            rf"\fill[orange!40] {p(W - TAB_TOP, 0)} -- {p(W, 0)} -- {p(W, TAB_SIDE)} -- cycle;",
            rf"\fill[red!35] {p(W - ZT, 0)} -- {p(W - TAB_TOP, 0)} -- {p(W, TAB_SIDE)} -- {p(W, ZS)} -- cycle;",
            rf"\draw[dashed,thick,black!60] {p(W - TAB_TOP, 0)} -- {p(W, TAB_SIDE)};",
        ] + [
            rf"\fill[black] {p(x, y)} rectangle {p(x + 8, y + 8)}; \fill[white] {p(x + 1.6, y + 1.6)} rectangle {p(x + 6.4, y + 6.4)}; \fill[black] {p(x + 2.8, y + 2.8)} rectangle {p(x + 5.2, y + 5.2)};"
            for x, y in MARKERS
        ]

    def labels(self) -> list[str]:
        t, p, n, odd = TEXT[self.lang], self.p, self.n, self.odd
        near = "north west" if odd else "north east"
        rot = f"{'-' if odd else ''}{ANGLE:.1f}"
        out = [
            rf"\node[anchor={near},font=\scriptsize\bfseries,blue!60!black] at {p(15, TOP + 0.6)} {{{t['header']}}};",
            rf"\node[anchor={near},font=\tiny,blue!60!black,align={'left' if odd else 'right'}] at {p(15, TOP + 3.6)} {{{t['header_sub'].format(hh=n(BODY - TOP), top=n(TOP), body=n(BODY))}}};",
            rf"\node[anchor={'south east' if odd else 'south west'},font=\footnotesize,blue!60!black] at {p(W - 20, BODY - 0.8)} {{{t['page']}}};",
            rf"\node[anchor={'south west' if odd else 'south east'},font=\footnotesize,blue!60!black] at {p(80, BODY - 0.8)} {{{t['title']}}};",
            rf"\node[font=\scriptsize\bfseries,orange!50!black,rotate={rot}] at {p(W - TAB_TOP * 0.45, TAB_SIDE * 0.45 - 2.5)} {{{t['tab']}}};",
            rf"\node[font=\tiny,red!60!black,rotate={rot}] at {p(W - TAB_TOP * 0.8 + 1.3, TAB_SIDE * 0.2 + 1.3)} {{{t['tol']}}};",
            rf"\node[anchor=north,font=\Large\bfseries,green!40!black] at {p(105, BODY + 18)} {{{t['content']}}};",
            rf"\node[anchor=north,font=\small,green!40!black] at {p(105, BODY + 26)} {{{t['size'].format(w=n(200), h=n(BOTTOM - BODY), top=n(BODY), bottom=n(BOTTOM))}}};",
            rf"\node[anchor=north,font=\small\itshape] at {p(105, BODY + 35)} {{{t['odd' if odd else 'even']}}};",
            rf"\node[font=\scriptsize\bfseries,violet!60!black] at {p(105, BOTTOM - 6)} {{{t['table']}}};",
            rf"\node[anchor=north,font=\tiny,red!60!black] at {p(W - ZT / 2 - 6, 0.3)} {{{n(ZT)} mm}};",
            rf"\node[anchor={'east' if odd else 'west'},font=\tiny,red!60!black] at {p(W - 0.5, ZS + 1.8)} {{{n(ZS)} mm}};",
        ]
        side = "west" if odd else "east"
        out.extend(
            rf"\draw[black!50] {p(0, y)} -- {p(3, y)}; \node[anchor={side},font=\tiny,black!60] at {p(14 if y == TOP else 1, y + (1.6 if y == BODY else -1.2))} {{y = {n(y)} mm}};"
            for y in (TOP, BODY, BOTTOM)
        )
        return out

    def legend(self) -> list[str]:
        t = TEXT[self.lang]
        x0, ly = (40 if self.odd else W - 170), BODY + 52
        out = [rf"\node[anchor=north west,font=\small\bfseries] at ({x0},{ly - 7}) {{{t['legend']}}};"]
        out.extend(
            rf"\fill[{c}] ({x0},{ly + i * 7}) rectangle ({x0 + 6},{ly + i * 7 + 4.5}); \draw[black!40] ({x0},{ly + i * 7}) rectangle ({x0 + 6},{ly + i * 7 + 4.5}); \node[anchor=west,font=\footnotesize] at ({x0 + 8},{ly + i * 7 + 2.25}) {{{label}}};"
            for i, (c, label) in enumerate(zip(COLOURS, t["items"], strict=True))
        )
        out.extend(rf"\node[anchor=west,font=\footnotesize\itshape,black!70] at ({x0},{ly + 48 + i * 5.5}) {{{note}}};" for i, note in enumerate(t["notes"]))
        return out

    def tex(self) -> str:
        body = self.areas() + self.labels() + self.legend()
        return "\n".join([r"\begin{tikzpicture}[remember picture,overlay,x=1mm,y=-1mm,shift={(current page.north west)}]", *body, r"\end{tikzpicture}\null\newpage"])


def document(lang: str) -> str:
    head = "\\documentclass{article}\n\\usepackage[a4paper,margin=0mm]{geometry}\n\\usepackage{tikz}\n\\pagestyle{empty}\\parindent0pt\n\\begin{document}\n"
    return head + Page(True, lang).tex() + "\n" + Page(False, lang).tex() + "\n\\end{document}\n"


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in TEXT:
        sys.exit(f"usage: {sys.argv[0]} {'|'.join(TEXT)} > out.tex")
    sys.stdout.write(document(sys.argv[1]))
