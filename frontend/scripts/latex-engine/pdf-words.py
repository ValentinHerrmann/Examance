"""Exact word boxes of a PDF for click-accuracy.mts (issue #347): [{page, x0, x1, y, text, chars}] in PDF points from the top-left, from pdfminer.six char boxes, as JSON on stdout. Usage: python3 pdf-words.py main.pdf > words.json (pip/uv: pdfminer.six)."""
import json, sys, unicodedata
from pdfminer.high_level import extract_pages
from pdfminer.layout import LTChar, LTTextLine, LTTextContainer, LAParams

out = []
for pno, page in enumerate(extract_pages(sys.argv[1], laparams=LAParams(char_margin=1.0, line_margin=0.3)), 1):
    h = page.height
    def walk(o):
        if isinstance(o, LTTextLine):
            word = []
            def flush():
                if word:
                    txt = ''.join(c.get_text() for c in word)
                    out.append({'page': pno, 'x0': word[0].x0, 'x1': word[-1].x1, 'y': h - (word[0].y0 + word[0].y1) / 2, 'text': txt,
                                'chars': [[c.x0, c.x1, c.get_text()] for c in word]})
                    word.clear()
            for c in o:
                ch = c.get_text() if isinstance(c, LTChar) else ' '
                if isinstance(c, LTChar) and unicodedata.category(ch[0])[0] in 'LN':
                    word.append(c)
                else:
                    flush()
            flush()
        elif hasattr(o, '__iter__'):
            for x in o:
                walk(x)
    walk(page)
print(json.dumps(out))
