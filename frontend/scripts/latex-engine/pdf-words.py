"""Exact word boxes of a PDF for click-accuracy.mts (issue #347): [{page, x0, x1, y, text, chars}] in PDF points from the top-left, from pdfminer.six char boxes, as JSON on stdout. Usage: python3 pdf-words.py main.pdf > words.json (pip/uv: pdfminer.six)."""
import json, sys, unicodedata
from pdfminer.high_level import extract_pages
from pdfminer.layout import LTChar, LTTextLine, LAParams


def word_entry(word, page_no, height):
    """One word (a run of letter and digit chars) as its JSON record."""
    return {'page': page_no, 'x0': word[0].x0, 'x1': word[-1].x1, 'y': height - (word[0].y0 + word[0].y1) / 2,
            'text': ''.join(c.get_text() for c in word), 'chars': [[c.x0, c.x1, c.get_text()] for c in word]}


def is_word_char(c):
    return isinstance(c, LTChar) and unicodedata.category(c.get_text()[0])[0] in 'LN'


def words_of_line(line, page_no, height):
    """The words of one text line: runs of letters and digits, split at everything else."""
    words, word = [], []
    for c in line:
        if is_word_char(c):
            word.append(c)
        elif word:
            words.append(word_entry(word, page_no, height))
            word = []
    if word:
        words.append(word_entry(word, page_no, height))
    return words


def walk(obj, page_no, height, out):
    """Collects the words of every text line below `obj`."""
    if isinstance(obj, LTTextLine):
        out.extend(words_of_line(obj, page_no, height))
    elif hasattr(obj, '__iter__'):
        for child in obj:
            walk(child, page_no, height, out)


def main():
    out = []
    for page_no, page in enumerate(extract_pages(sys.argv[1], laparams=LAParams(char_margin=1.0, line_margin=0.3)), 1):
        walk(page, page_no, page.height, out)
    print(json.dumps(out))


main()
