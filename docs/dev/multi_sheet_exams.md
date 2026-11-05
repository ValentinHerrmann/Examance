# Exams with several sheets (page codes, booklets, filler pages)

Issue #220. How an exam that spans several sheets is printed, scanned and put back together. User guide: [Several sheets](../user/exams.md#multi-sheet).

## Settings (per exam, each independent)

All settings are plain `exams` columns (migrations 0058 and 0059). `printSettingsOf` (`lib/exam/printLayout.ts`) is the only reader; `saveExamLayout` (`lib/exam/saveExamLayout.ts`) is the only writer.

| Column | Values | New exams | Where | Effect in `Schulaufgabe.sty` |
|---|---|---|---|---|
| `page_codes` | bool | `true` | Layout tab | `seitencode` |
| `padding_pages` | `none`, `blank`, `workspace` | `workspace` | Layout tab | `fuellleer` / `fuellplatz` |
| `print_layout` | `duplex`, `booklet` | `duplex` | Print step | `broschuere` |
| `print_mode` | `stickers`, `copies` | `stickers` | Print step | sticker spots only in `stickers` mode |
| `sticker_spots` | `cover`, `sheet`, `a3`, `leaf` | `sheet` | Print step (sticker mode) | `\Aufkleberseiten{bogen|a3}` |

- The server defaults are the old layout, so older exams compile unchanged. Migration 0059 also:
  - moves the old print-plan mode (`step_checks.printPlan.mode`, issue #212) into `print_mode`;
  - sets `padding_pages = 'none'` where page codes were off.
- The print plan in `step_checks` keeps only `solution` and `booklet` (`impose`/`printer`). These don't shape the sheet.
- `contentStamp` covers the settings whenever they differ from the old layout, so a change marks made PDFs and ticks as outdated.
- **Layout tab** (`ExamLayoutSettings`): every field saves itself after 800 ms (a logo choice at once). The card header shows "Saving…/Saved". There are no buttons.

## Page codes

- **Payload** (`lib/exam/pageCodes.ts`), QR level Q:
  - plain sheet: `EXM1:<tag>:<page>`;
  - personalised copy: `EXM1:<tag>:<page>:<id>`.
  - `<tag>` is the first 8 hex characters of the exam id, in upper case.
  - `<id>` is the sticker's ID (`parseStudentQr(payload).studentNumber`: the 6-character sticker ID or the Mebis/Artemis id), never the name.
  - Both stay at QR version 1 or 2 (`tests/pageCodes.test.ts`). At 14 mm that is about 0.5 mm per module, so about 4.4 px per module at the app's 216 dpi render. ZXing is reliable from about 3 px per module, so 200 ppi scans work.
- **Drawing**: the builder emits `\Seitencode{<page>}{<grid>}{<runs>}` for pages 1..40 into the student sheet (`pageCodesLatex`). The sty draws them as TikZ rectangles, so no QR package is needed.
- **Placement**: 14 mm square, 77–91 mm from the cut side, on the inner side of the cut-side top marker. Its bottom edge is level with the marker's (20 mm from the top). There the cut zone is only 2.6 mm deep, and the head band keeps its 30 pt.
  - With page codes the marker sits at 66 mm (`\SA@fidTopX`), and page 1's title keeps 96 mm from the cut side.
  - `lib/qr/cutCorner.ts` `PAGE_CODE` mirrors the numbers.
- Each code carries an `omr://__page__/<n>` link. `examCopies.ts` stamps the personalised code over it at the same size; `parseOmrUri` ignores it.
- **Checks before personalised copies**: `stickerIdIssues` (`sharing/stickerEntries.ts`).
  - Students who share an ID block the copies.
  - Students without an ID get a warning: their pages keep the plain code, so only their cover names them.

## Filler pages, sticker spots, fold cut zone

- **Filler pages**: after the points table, `\SA@fillsheets` adds pages until the count is a multiple of 2 (or 4 with `broschuere`). They read "Platz für Nebenrechnungen" or "Diese Seite bleibt absichtlich leer." They carry markers and codes and are part of the OMR template. Personalised copies of these exams get no extra blank back from `examCopies.ts`.
- **Sticker spots** (sticker mode, `stickerPagesOf`): sticker labels are 35 mm, so a spot is a faint (`black!4`), unlabelled 35×35 mm square over the header.
  - Position: on the uncut side, 10 mm beside that side's top marker (15–50 mm from the edge, 18–53 mm on booklets) and 3–38 mm from the top.
  - Only a 17 mm full-width strip at the top of the body stays free. `\@outputpage` lowers `\@colht` for such a page, and `\@makecol` and `\@texttop` give the room back as space above the text, so page breaks know about it.
  - `bogen`: every odd page from page 3.
  - `a3`: the front-right page of each A3 sheet, i.e. odd page `p` with `2p + 2 <=` the total. The total comes from the previous pass's `.aux`, as `\SA@total`.
  - Personalised copies get none: every page code names the student.
- **Fold cut zone** (`broschuere`):
  - a dashed cut line with scissors 6 mm from the fold edge (left on odd pages, right on even pages);
  - a `black!7` strip between the line and the fold. On an A3 sheet that gives a 12 mm band where a slightly crooked cut along the fold is still safe and nobody writes.
  - Text and the fold-side markers start 8 mm from the fold (`\SA@foldinset`; the geometry is `twoside` with `inner=8mm`, `outer=5mm`). The outer side keeps 5 mm, the points table stays 1.5 mm clear of both bottom markers. `lib/qr/cutCorner.ts` `FOLD_STRIP`/`FOLD_INSET` mirror the numbers; registration reads the markers' positions per page from the template.

## Print step (`components/exam/PrintPlan.svelte`)

- **The plan card holds all print settings**: mode, double-sided or booklet, who arranges booklets, sticker spots, and with solution.
- **"Create print files" is the one action:**
  - it compiles the task sheet when it isn't current;
  - it compiles the solution only when the plan prints it (`compileExamPreview({ solution: false })`; `ExamPreviewStatus.solution` tracks it separately; unchanged sources come from the compile cache);
  - then it makes the sticker or copies PDF unless the current one is still valid (`printMadeValid`).
  - Job cards keep only download and the "printed" tick.
- **Made files follow the settings, not only the content**:
  - `printFileKey` (layout arranging, sticker count) is stored with each file made in this visit; a file under another key is outdated, hidden and remade.
  - With Examance arranging a booklet, `prepare()` imposes the current task sheet (`imposeBooklet`); preview pane and download are those A3 sheets, keyed to the compiled sheet's `ExamPreviewStatus.version`.
  - The `qr` stamp also covers the content while later sheets get sticker spots (`printStamps(…, print)`): the count follows the pages.
  - `prepare()` counts the compiled sheet's pages itself and waits a tick, so the sticker form has the new count before it makes its PDF.
- **Options as tiles** (`ui/OptionTile`, shared with Settings): each group has a small heading and its explanation behind (i); the tiles carry a title and one short line.
- **The preview shows only what will be printed** (`PrintPlan` `bind:shown` → `ExamPreviewPanel` `sheets` + `currentOnly`, `DualPdfPreview` `hideEmpty`): the task sheet only when plain copies are printed, the solution only when planned, each only while it matches the sources; sticker and copies PDFs only while they were made for the current content. With nothing ready the area asks for "Create print files".
- **Booklets** (`lib/qr/booklet.ts`):
  - `imposeBooklet` lays each copy two-up on A3 in saddle-stitch order;
  - `splitCopies` makes one A4 PDF per student for the printer's booklet function (ZIP).

## Scanning (`lib/scan/ingest.ts`, `lib/scan/scanPdf.ts`)

- **Decoding**: the QR worker returns every code on a page.
  - When a page-coded exam's page shows no page code, `decodeCodeSpots` renders both possible spots at about 430 dpi and decodes again.
  - `classifyCodes` turns the codes into:
    - the student: a sticker, or the page code's ID through `stickerIdMap` (the exam's students, read once before scanning; shared IDs map to nobody);
    - the page number;
    - a page of another exam: its own unmatched booklet;
    - an ID nobody has: an unmatched booklet `ID-<id>`, plus a warning.
- **A3 sheets** are split into lossless A4 halves, right half first. The front-right page carries the sticker spot, so the left half follows the right student. The A3 originals are attached to the student's scan as `original-scan.pdf`. Every rebuild copies the attachment: the manual split, and `renderGradedPdf`.
- **Order** (`bookletLayout`):
  - pages go to slot `page`;
  - a missing slot gets a placeholder (`/ExamanceMissing <n>`) and a warning;
  - pages scanned twice and code-less pages follow the slots;
  - without codes, scan order is kept.
  - A later scan fills an earlier submission's placeholders.
  - Score boxes are drawn on the first N pages when the scan has at least the template's page count.

**Never drop a page** (legal requirement): every scanned page is stored, exported and archived (`tests/scanIngest.test.ts`).
