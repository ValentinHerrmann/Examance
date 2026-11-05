# Exams with several sheets (page codes, booklets, filler pages)

Issue #220. How an exam that spans several sheets is printed, scanned and put back together. User guide: [Several sheets](../user/exams.md#multi-sheet).

## Layout options (per exam)

Four plain columns on `exams` (migration 0058), edited in the Layout tab (`components/exam/ExamLayoutSettings.svelte`), read through `printSettingsOf` (`lib/exam/printLayout.ts`):

| Column | Values | Default for new exams | `Schulaufgabe.sty` option |
|---|---|---|---|
| `page_codes` | bool | `true` (older exams: `false`) | `seitencode` |
| `print_layout` | `duplex`, `booklet` | `duplex` | `broschuere` |
| `padding_pages` | `blank`, `workspace` | `workspace` | `fuellplatz` |
| `sheet_stickers` | bool | `true` | `bogenaufkleber` |

The server default is the old layout (`page_codes = false`), so every exam compiled before keeps its sources, its printed sheets and its OMR template. The other three options do nothing without `seitencode` (`withExamOptions`, `lib/exam/examPreview.ts`). New exams get `NEW_EXAM_PRINT` from `routes/exam/new`. The options are part of `contentStamp` only when page codes are on, so stamps of older exams stay as they were.

## Page codes

- **Payload** (`lib/exam/pageCodes.ts`): `EXM1:<tag>:<page>` on the plain sheet, `EXM1:<tag>:<page>:<sticker text>` on personalised copies. `<tag>` is the first 8 hex characters of the exam id in upper case, which keeps the plain code in QR alphanumeric mode (version 1, 21 modules). The sticker text is the cover sticker's payload (`formatStudentQr`), so any page alone names its student; it may contain colons, so it is always the last field.
- **Drawing**: the builder emits `\Seitencode{<page>}{<grid>}{<runs>}` for pages 1..`MAX_PAGE_CODES` (40) into the student sheet's preamble (`pageCodesLatex`). The sty draws them as TikZ rectangles, so neither engine needs a QR package. Pages past 40 get no code and are matched by position.
- **Placement** (`Schulaufgabe.sty` section 11): 12 mm square, 48–60 mm from the cut side and 12–24 mm from the top, between "Seite X" and the cut-side top marker. That marker moves from 46 mm to 66 mm (`\SA@fidTopX`), the head band grows to 36 pt, and page 1's title keeps 82 mm from the cut side. Each code carries an `omr://__page__/<n>` link: `examCopies.ts` stamps the personalised code over it, and `parseOmrUri` ignores it.
- **Solution**: no codes and no filler pages, same geometry.

## Filler pages and sticker boxes

- After the points table, `\SA@fillsheets` adds pages until the count is a multiple of 2 (duplex) or 4 (booklet). With `fuellplatz` they say "Platz für Nebenrechnungen", otherwise "Diese Seite bleibt absichtlich leer." They carry markers and page codes and are part of the OMR template, so a scanned filler page is an ordinary page. Personalised copies of these exams get no extra blank back from `examCopies.ts`; older exams still do.
- `bogenaufkleber` (duplex only) reserves 38 mm at the top of every sheet front from page 3 on, for a 35 mm `omr://__qr__` box on the uncut side. The room is reserved through the kernel's column height (`\@outputpage` lowers `\@colht` for such a page, `\@makecol` restores it and `\@texttop` adds the space), so page breaks account for it. Body text does not flow beside the box. `stickerBoxesPerCopy` sets how many stickers the sticker sheet suggests per student.

## Printing (`lib/qr/examCopies.ts`, `lib/qr/booklet.ts`, `components/exam/PrintPlan.svelte`)

- `renderExamCopies` stamps every `__qr__` box and every page code of each copy, and returns `pagesPerCopy`. All copies have the same length.
- **Booklet, Examance arranges the pages** (`PrintPlan.booklet = 'impose'`, the default): `imposeBooklet` lays each copy two-up onto A3 in saddle-stitch order (`bookletSides`), with fold marks at the middle of the top and bottom edges. The plain sheet in sticker mode is one imposed booklet.
- **Booklet, the printer arranges the pages** (`'printer'`): personalised copies download as a ZIP with one A4 PDF per student (`splitCopies`, `StickerSheetForm` `onPdf`'s `download`); the plain sheet stays A4.

## Scanning (`lib/scan/ingest.ts`, `lib/scan/scanPdf.ts`)

- The QR worker returns every code on a page (up to 4). `classifyCodes` turns them into the student (personalised page code first, else a sticker), the printed page number, and whether the page belongs to another exam (another tag: its own unmatched booklet plus a `foreignPage` warning).
- **Booklet sheets**: an unrotated A3 landscape page (`isA3Landscape`) is split into two lossless A4 page embeds (`splitA3`), and each half is decoded and OMR-read on its own. The A3 pages are attached to that student's scan as `original-scan.pdf` (`attachOriginals`). Every rebuild of a scan copies the attachment: the manual split on the scan page and `renderGradedPdf`, so graded and shared PDFs keep it too.
- **Order** (`bookletLayout`): pages with a code go to slot `page` (1..n, where n is the template's page count or the highest code seen). A missing slot gets a placeholder page (`addPlaceholderPage`; page-dict key `/ExamanceMissing <n>`) and a `missingPages` warning. Pages scanned twice and code-less pages in a coded booklet follow the slots (`extraPages`). Without any code the booklet keeps scan order, as before. OMR uses `templatePages[page - 1]` for coded pages and skips code-less pages in a coded booklet.
- **Filling placeholders**: a coded booklet whose student already has a submission with placeholders is merged into it (same id, same `createdAt`). A placeholder gives way to its page, and every other new page goes after the earlier ones.
- **Score boxes**: the template's pages are the first pages of a stored scan, so the viewer and the graded export draw boxes when the scan has at least the template's page count, on those first pages only. This also fixes older duplex copies whose scanned blank back page left every box empty.

**Never drop a page** (legal requirement): every scanned page is stored, exported and archived. `tests/scanIngest.test.ts` asserts that `bookletLayout` places each page exactly once. Warnings appear on the scan page as "page notes".
