# Exams with several sheets (page codes, booklets, extra pages)

Issues #220 and #228. How an exam that spans several sheets is printed, scanned and put back together, and how extra paper joins it. User guide: [Several sheets](../user/exams.md#multi-sheet).

## Settings (per exam, each independent)

All settings are plain `exams` columns (migrations 0058, 0059 and 0060). `printSettingsOf` (`lib/exam/printLayout.ts`) is the only reader; `saveExamLayout` (`lib/exam/saveExamLayout.ts`) is the only writer.

| Column | Values | New exams | Where | Effect in `Schulaufgabe.sty` |
|---|---|---|---|---|
| `page_codes` | bool | `true` | Layout step | `seitencode` |
| `print_layout` | `duplex`, `booklet` | `duplex` | Layout step | `broschuere` |
| `print_mode` | `stickers`, `copies` | `stickers` | Layout step | sticker spots only in `stickers` mode; `copies` also without `digital_grading` (issue #272), then `printSettingsOf` reads `results_qr_box` as on, since copies stamp their code into the box and `examCopies.ts` draws page 1's corner tab itself |
| `sticker_spots` | `cover`, `sheet`, `a3`, `leaf` | `sheet` | Layout step (sticker mode) | `\Aufkleberseiten{bogen|a3}` |
| `paper_style` | `empty`, `squared`, `dotted`, `lined` | `squared` | Layout step | `papierkaro` / `papierpunkte` / `papierlinien` |
| `dotted_fields` | bool | `false` | Layout step (Writing space) | `karopunkte`: `\kariert` and `\LoesungKaro` draw a 5 mm dot grid on the student sheet (issue #314) |
| `extra_pages` | int 0–20 | `0` | Layout step | `\Zusatzseiten{n}` |
| `booklet_offset_mm` | float −10…10 | `0` | Print step | none (applied by `imposeBooklet`) |
| `digital_grading` | bool | `true` | Layout step (the corner-markers switch) | off: `ohnemarken` (no corner markers, room kept), steps 5A–7A greyed out; `namenszeile` unless `results_qr_box` and not `name_line` (helper `printsNameLine` in `lib/exam/printLayout.ts`); without `results_qr_box` no sticker spots (`printSettingsOf` reads them as `cover`) |
| `cut_corner` | bool | `true` (migration 0070: `digital_grading`) | Layout step | off: `ohneecke` (no tinted corner, cut line or scissors); always on for `copies`, whose name and key sit there (`printSettingsOf`); absent in older records = `digital_grading` |
| `fold_strip` | bool | `true` (migration 0070: `digital_grading`) | Layout step | off: `ohnefalz` (booklets only); absent in older records = `digital_grading` |
| `results_qr_box` | bool | `false` | Layout step name choice (only when `digital_grading` is off) | `ergebnisqr` (page 1 keeps the QR sticker box with the initials field when there is no name line) |

- Scan aids are separate `Schulaufgabe.sty` options since issue #272: `ohnemarken`, `ohneecke` and `ohnefalz`, emitted one by one by `withExamOptions`; page codes and sticker spots follow `page_codes` and `sticker_spots` alone. `ohnescan` stays a legacy alias (all three, plus no page codes or sticker spots), so old pinned layouts compile the same. Migration 0070 sets `cut_corner`, `fold_strip` and `page_codes` off and `sticker_spots` to `cover` for paper-graded exams, which printed none of them; `contentStamp` stamps the two new switches only when they differ from `digital_grading`, so older print files stay current; paper-graded exams whose stored page codes or spots the migration cleared, and personalised paper copies (now with the cut corner on every page), get a new stamp once and their print files are made again. Only the corner markers are technically required for scanning; the Layout step warns about them alone (`allScanAidsOn` drives its "Turn on all scan aids" button). The preview moves its page only on focus or a click (`SheetSketch` `show`); hovering only stresses an element (`highlight`).
- The server defaults are the old layout, so older exams compile unchanged. Migration 0059 also:
  - moves the old print-plan mode (`step_checks.printPlan.mode`, issue #212) into `print_mode`;
  - set `padding_pages = 'none'` where page codes were off (the column went with migration 0060, issue #228).
- The print plan in `step_checks` keeps only `solution` and `booklet` (`impose`/`printer`). These don't shape the sheet.
- `contentStamp` covers the settings whenever they differ from the old layout, so a change marks made PDFs and ticks as outdated.
- **Layout step** (`routes/exam/[id]/layout` + `exam/ExamLayoutSettings`, issue #272): presets in `lib/exam/layoutPresets.ts` (starting points, never stored; the matching one is derived from the settings), the preview (`components/exam/sketch/SheetSketch`): a fixed sample exam (`lib/exam/layoutSample.ts`, never the teacher's content) compiled once per tab into the cache kind `layout-sample` with as few features as possible (`ohnemarken`, `ohneecke`, `ergebnisqr`, `namenszeile`, MC hint on, duplex; 30 + 5 minutes in the header, info text replaced by two `omr://__sample__/info-start`/`info-end` markers whose room the preview fills with the exam's own info text via `infoTextLines`) and rendered by `pdf/renderPages.ts`; `SketchPage` draws every option over the page image (markers, cut tab, page codes, fold strip, sticker spots, printed QR, paper) and masks what an exam leaves out (QR box, name line, initials, MC hint), placed by the `omr://__qr__` link and the sample's own `omr://__sample__/mc` and `/rest` markers. `sheetSketchOf` adds the exam's extra pages and the filler pages up to whole sheets; `focusPageOf` picks the page an option shows on. Options that reflow content (booklet margins, sticker room, MC hint lines) are drawn, not reflowed. Without a compile (or in the e2e fake, which answers blank pages) the pages are sketched. Every field saves itself after 800 ms (a logo choice at once). The card header shows "Saving…/Saved". There are no buttons.

## Page codes

- **Payload** (`lib/exam/pageCodes.ts`), QR level Q:
  - plain sheet: `EXM1:<tag>:<page>`;
  - personalised copy: `EXM1:<tag>:<page>:<id>`.
  - `<tag>` is the first 8 hex characters of the exam id, in upper case.
  - `<id>` is the sticker's ID (`parseStudentQr(payload).studentNumber`: the 6-character sticker ID or the Mebis/Artemis id), never the name.
  - Both stay at QR version 1 or 2 (`tests/pageCodes.test.ts`). At 14 mm that is about 0.5 mm per module, so about 4.4 px per module at the app's 216 dpi render. ZXing is reliable from about 3 px per module, so 200 ppi scans work.
- **Drawing**: the builder emits `\Seitencode{<page>}{<grid>}{<runs>}` for pages 1..40 into the student sheet (`pageCodesLatex`). The sty draws them as TikZ rectangles, so no QR package is needed.
- **Placement**: 14 mm square, 75.5–89.5 mm from the cut side (77–91 mm before issue #227), on the inner side of the cut-side top marker (67.5–72.5 mm). Its bottom edge is 20 mm from the top (higher would reach the printer's unprintable margin). There the cut zone has ended, and the head band keeps its 30 pt.
  - With page codes the marker sits at 66 mm (`\SA@fidTopX`), and page 1's title keeps 96 mm from the cut side.
  - `lib/qr/cutCorner.ts` `PAGE_CODE` mirrors the numbers.
- Each code carries an `omr://__page__/<n>` link. `examCopies.ts` stamps the personalised code over it at the same size; `parseOmrUri` ignores it.
- **Checks before personalised copies**: `stickerIdIssues` (`sharing/stickerEntries.ts`).
  - Students who share an ID block the copies.
  - Students without an ID get a warning: their pages keep the plain code, so only their cover names them.

## Filler pages, sticker spots, fold cut zone

- **Filling whole sheets** (no setting since issue #228): on the printed student sheet (option `fuellen`; `fuellleer`/`fuellplatz` remain accepted aliases), `\SA@fillsheets` adds extra pages after the asked ones until the count is a multiple of 2 (or 4 with `broschuere`). They carry markers and codes and are part of the OMR template. Personalised copies get no extra blank back from `examCopies.ts`.
  - The multiple follows the print form chosen in the Layout step, so the Exam step's preview is a **draft** without them: `buildExamLatex(…, { fill: false })`, compiled into the cache variant `draft` (`ExamPreviewPanel draft`). It never stands in for the printed `angabe`.
  - The Print step, exports, sharing, the overview preview and the OMR template use the filled sheet.
- **Sticker spots** (sticker mode, `stickerPagesOf`): sticker labels are 35 mm, so a spot is a faint (`black!4`), unlabelled 35×35 mm square over the header.
  - Position: on the uncut side, 2 mm beside that side's top marker (13.5–48.5 mm from the edge, 16.5–51.5 mm on booklets) and 3–38 mm from the top.
  - Only a 17 mm full-width strip at the top of the body stays free. `\@outputpage` lowers `\@colht` for such a page, and `\@makecol` and `\@texttop` give the room back as space above the text, so page breaks know about it.
  - `bogen`: every odd page from page 3.
  - `a3`: the front-right page of each A3 sheet, i.e. odd page `p` with `2p + 2 <=` the total. The total comes from the previous pass's `.aux`, as `\SA@total`.
  - Personalised copies get none: every page code names the student.
- **Fold cut zone** (`broschuere`):
  - a dashed cut line with six scissors over its height 6 mm from the fold edge (left on odd pages, right on even pages; `\SA@scissors` is the one scissors shape, also on the corner line);
  - a `black!7` strip between the line and the fold. On an A3 sheet that gives a 12 mm band where a slightly crooked cut along the fold is still safe and nobody writes.
  - Text starts 8 mm from the fold (`\SA@foldinset`), the fold-side markers 9.5 mm (plus `\SA@fidpad`; the geometry is `twoside` with `inner=8mm`, `outer=5mm`). The outer side keeps 5 mm, the points table stays 1.5 mm clear of both bottom markers. `lib/qr/cutCorner.ts` `FOLD_STRIP`/`FOLD_INSET` mirror the numbers; registration reads the markers' positions per page from the template.

## Extra paper (issue #228)

- **One pattern**: `\SA@pattern{width}{height}` draws the `paper_style` (whole 5 mm squares, a 5 mm dot grid or 8 mm lines, light grey; empty is blank space). Every writing space uses it.
- **Full writing pages**: `\SA@writingpage{heading}{note}` puts only the heading in the flow. The pattern is drawn at shipout (`\SA@wpdraw` in `\AddToShipoutPictureBG`) over the text area below the heading and below a sticker spot.
  - Never in the flow: a sticker-spot page has 17 mm less room than the page builder reports, and an in-flow grid spilled onto a new page, leaving a page with only its heading.
  - It serves the extra sheet and the extra pages: `\Zusatzseiten{n}{title}{note}` adds at least n of them in `\AtEndDocument` after the points table, on the student sheet only; filling whole sheets adds more of the same (`\SA@extrapage`, default heading "Platz für weitere Lösungen" without `\Zusatzseiten`).
  - Heading and note share one line (`\EN@head`), each in its own size.
  - They are ordinary pages: markers, page codes, sticker spots, the OMR template and personalised copies need nothing extra.
- **The writing space** (`exams.extra_notes`, issues #156 and #228, Layout step, `ExtraNotesField`):
  - its title and note head the rest-of-page area and every extra page (`DEFAULT_EXTRA_NOTES` when never set);
  - `fill` (absent = true) switches the rest-of-page area: `\ExamNotes{title}{note}{min}{max}` stays in the flow with a dynamic height within min..max, minus the points table and a sticker spot;
  - when min does not fit, it takes a whole new page (an implicit extra page, no max);
  - migration 0060 sets `paper_style = squared` for exams that had the area, so it stays squared.
- **Extra sheet** (`extraSheetLatex`, `compileExtraSheet` in `lib/exam/examPreview.ts`; the compile cache kind is `extra-sheet`, keyed by the paper style): option `zusatzblatt` plus `\Zusatzblatt`. It is one duplex sheet:
  - no cover and no exam title, only "Zusatzblatt" centred in the head;
  - a sticker spot on the front (same geometry as `\SA@stickerspot`);
  - the page code `EXM1:X` on both sides (`EXTRA_SHEET_CODE`, `isExtraSheetCode`). It names no exam and no page, so one printed stack serves every exam.
- **Print step**: the extra-sheet card is always there; "Create print files" also compiles the extra sheet (cached by paper style), shown as the `extra` preview pane. It has no "printed" tick: the sheet is printed in stock.
- **Preview invalidation**: every edit that changes the printed exam bumps the page's `layoutVersion` (`afterLayoutChange` on the Exam step, `savePrint` on the Print step, including a quick exercise edit), and a reopened page compares the cached PDF with the current sources. `tests/examPreview.test.ts` checks that each print-shaping option changes the source.
- **Stickers**: the sticker sheet adds no spare stickers for extra paper; the teacher reprints one student's sticker (reprints always match).

## Print step (`components/exam/PrintPlan.svelte`)

- **The plan card holds the how-to-print settings**: who arranges booklets, booklet offset and test sheet, with solution, the extra-sheet stack. Mode, double-sided or booklet and sticker spots are set in the Layout step; the plan shows a one-line summary with a link back.
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
  - `imposeBooklet` lays each copy two-up on A3 in saddle-stitch order, draws the fold mark (a thin line on the fold, heavier ticks at top and bottom) and shifts each sheet by the exam's `booklet_offset_mm` (±10 mm, Print step; `printFileKey` includes it, so a new shift re-makes the imposed files). `bookletTestSheet` is the two-sided A3 calibration sheet: folded edge to edge, the crease crosses a ruler around the printed centre;
  - `splitCopies` makes one A4 PDF per student for the printer's booklet function (ZIP).

## Scanning (`lib/scan/ingest.ts`, `lib/scan/scanPdf.ts`)

- **Decoding**: the QR worker returns every code on a page.
  - When a page-coded exam's page shows no page code, `decodeCodeSpots` renders both possible spots at about 430 dpi and decodes again.
  - `classifyCodes` turns the codes into:
    - the student: a sticker, or the page code's ID through `stickerIdMap` (the exam's students, read once before scanning; shared IDs map to nobody);
    - the page number;
    - a page of another exam: its own unmatched booklet;
    - an extra sheet (`EXM1:X`): `extra`; never foreign, never read as a sticker, the student comes from the sticker or, on the back, from the page before;
    - an ID nobody has: an unmatched booklet `ID-<id>`, plus a warning.
- **Large-print copies** (issue #265, [time_extensions.md](time_extensions.md)): an upright A3 page is an A4 sheet enlarged for one student. It is kept as scanned and rendered at A4 geometry everywhere (`scanViewport`), so codes, fiducials and boxes are found as usual.
- **Uncut booklet sheets**: a page that looks like A3 (after its `/Rotate`) is split straight away. Any other landscape page is split when both halves of its render carry a page code, so rotated, scaled or cropped scanner output works too (`isLandscape`, `ScanPass.halvesCoded`).
- **A3 sheets** are split into lossless A4 halves, right half first. The front-right page carries the sticker spot, so the left half follows the right student. The A3 originals are attached to the student's scan as `original-scan.pdf`. Every rebuild copies the attachment: the manual split, and `renderGradedPdf`.
- **Order** (`bookletLayout`):
  - pages go to slot `page`;
  - a missing slot gets a placeholder (`/ExamanceMissing <n>`) and a warning;
  - pages scanned twice and code-less pages follow the slots;
  - extra sheets always come last, in scan order, and OMR skips them;
  - without codes, scan order is kept.
  - A later scan fills an earlier submission's placeholders. The joined submission is saved as a scan-only record; `submissionRepository.save` keeps its annotations and total in both storage modes (issue #282).
  - A booklet of only extra paper joins the student's newest scan, appended after its pages (`onlyExtraPaper`, `submissionToJoin`); it never starts a second submission. Code-less stickered pages count as extra paper only in page-coded exams, since without codes every page looks like that.
  - Loose pages (`extraPages`) are reported as a note, not a warning; extra sheets are not reported.
  - **The first scan of a page decides its MC rows (issue #283).** Every reading carries its `pageRef`, and `saveBooklet` saves only readings of pages that took their slot (`fillSlots`/`fillEarlier` return `placed`): a page number this booklet or the joined scan already holds is kept at the end, reported as `repeatedPages` (scanned again, or a second student whose sticker was not read: split, then re-run MC detection), and its MC answers are not read. A coded booklet always joins the student's scan (`submissionToJoin(…, anyScan)`): a page past the earlier scan's page count is new and read; one within it that fills no placeholder is a repeat. `mergeCheckedRows` keeps a verified (`isMcReviewed`) or hand-set (no `omrMeta`) row as `mergeRedetectionIntoVerified` does; an unverified detection is replaced. A joined scan's rows are written before the scan, so a failed scan write can be retried (the placeholders are still there). A repeat on a scan with hand grading gets the note `repeatedGraded`, since `splitScan` refuses it.
  - Score boxes are drawn on the first N pages when the scan has at least the template's page count.

**Split and delete** (`lib/scan/scanActions.ts`, issue #292): `splitScan` stores the second part first (an unmatched student, its submission and the MC rows read from its pages, `detections.pageIndex` rebased; these writes never wait in the offline queue, `noQueue`), then shrinks the original and moves the old rows to the trash, so a failure leaves at worst a duplicate, never a lost page. Grading saves always pass `omitScan`, which also keeps the stored scan in hybrid mode, so an open grade page never writes its stale copy over pages scanned since. A scan with hand grading (an annotation layer or a score row without `omrMeta`) is refused. `deleteScans` removes a student only when no other submission of the exam still uses the pseudonym.

**Never drop a page** (legal requirement): every scanned page is stored, exported and archived (`tests/scanIngest.test.ts`).
