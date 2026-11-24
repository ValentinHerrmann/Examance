# LaTeX compile speed (issue #341)

Where a compile spends its time, what Examance does about it, and what was tried and left out.

## Where the time goes

A print job compiles the task sheet and, if printed, the solution: two documents, whatever the number of students. Every per-student copy (QR codes, page codes, corner tab, booklets, A3 copies) is pdf-lib post-processing of those two PDFs (`qr/examCopies.ts`, `qr/booklet.ts`). The cost therefore sits in each single compile:

- **TeX passes.** Schulaufgabe passes each task's score to the next run through `main.aux`, so a document compiled from nothing needs two passes.
- **The preamble.** Every pass loads the whole template, so subject packages a document never uses (tikz-uml alone is 5,375 lines) are paid on every pass.
- **Repeats.** Before #341 the server invoked Tectonic twice (Tectonic already reruns until the aux file settles, so that was two extra passes; since round 4 the runner drives the passes itself), the solution waited for the task sheet, and every reload compiled again.

## What Examance does

| Measure | Where | Effect |
|---|---|---|
| One compile run, passes until the aux settles | `services/texrunner.py` `run_tex` (was `services/tectonic.py`) | XeLaTeX passes run until `main.aux`, `.toc` and `.out` settle (max 4) |
| Subject packages only when used | `lazy` in `latex_package_rules.json`, both mergers (`docs/dev/latex_packages.md`) | a document without them skips their load on every pass |
| Aux seeding | `compileCache.ts` `seedFor`, `compiler.worker.ts` `compileUntilStable`, `seed_aux`/`return_aux` on `POST /compile/latex/jobs` | an edit that keeps the layout usually needs one pass |
| Task sheet and solution at once | `examPreview.ts` `compileExamPreview` (server engine only; the browser engine is one queue) | the solution no longer waits |
| Compiled PDFs kept across reloads | `latex/compileStore.ts`, Dexie table `compiledPdfs` | a reload shows the last preview without compiling |
| Compile time shown | `ExamPreviewPanel` status line, Print step readiness | teachers and bug reports see engine and seconds |

Measured with Tectonic 0.15 and a warm cache, on a 12-task exam without subject packages:

| | fresh compile | edit with seeded aux |
|---|---|---|
| Before #341 (two invocations, full preamble) | ~5.8 s | ~5.8 s |
| After | 2.6 s | 1.4 s |

The warm-up document (all subject packages) takes 4.3 s fresh and 2.5 s seeded.

### Round 2: a real exam (goal: at most 2 s per PDF)

An 8-page Informatik exam (9 tasks, 7 listings, page codes, filler pages, dot paper) still took 12-21 s per PDF on the preview server and 15-28 s in the browser. The profile (Tectonic 0.15, warm cache; seeded = one TeX pass) attributed it:

| Cost per TeX pass | Seconds |
|---|---|
| Dot paper drawn as one TikZ `\fill` per dot (one page of it) | ~1.8 |
| Template packages (`packages.sty`; Libertine 0.4, hyperref 0.2, TikZ and libraries 0.3) | ~1.0 |
| Engine and output (empty `article`) | 0.4 |
| Exam body (8 pages) | ~1.0 |
| Page codes, one `\fill` per dark run | ~0.2 |

A first compile runs three passes (Tectonic reruns until `main.aux` settles), so it costs three times the seeded figure. Fixes, each measured on that exam:

| Change | Student sheet fresh / seeded |
|---|---|
| Before | 17.7 / 5.3 s |
| Dot grids as one row drawn once and stacked (`\LSG@dotgrid` in `Loesung.sty`, used by `\punktraster`, `\kariert` under `karopunkte` and the writing paper) | 8.5 / 3.1 s |
| Page codes as one path filled once (`\SA@pcdraw`) | 7.9 / 2.7 s |
| No hard-coded `\usepackage{sty/tikz-uml}` in the exam and exercise builders (the lazy rule loads it when used) | 6.6 / 2.4 s |

A booklet with dot grids went from 21.9 / 10.9 s to 3.6 / 1.9 s.

- **Same output:** rendered at 300 dpi and thresholded, the pages match except for 11-24 edge pixels. The dots sit on the same 5 mm grid; the single page-code path only drops the anti-aliasing seams between runs.
- **Scan template:** it now shares the student sheet's cache slot (`exam`/`angabe`) instead of its own `omr-blank` one. A click on compile therefore no longer runs a third full compile without seeds, and the Print step reuses that PDF.

What is left per seeded pass is the template's package load (~1 s) and the engine (0.4 s). The next lever was a precompiled format, which Tectonic cannot load; it is done on the server in round 4.

### Aux seeding rules

- Seeds are only `main.aux`, `main.toc` and `main.out` (`AUX_FILE_NAMES`, mirrored in the worker's `AUX_EXTENSIONS`), at most 512 KB each.
- TeX reads the aux file as code, so the server runs seeds through the same path tripwire as `main.tex` (`reject_unsafe_paths`).
- A stale seed is safe: the engine sees the aux files change and reruns. It only costs the pass it would have saved.
- A slot is seeded from its own last compile, else from its sibling (`draft` and `angabe` differ only in the filling pages). The seeds are kept independently of the content hash, so an edited document still finds them.

### The persisted cache

- Records are sealed with the session key and bound to their slot key (`sealCompiledPdf`, AAD `compiledPdf`). The content hash sits inside the ciphertext, so no plaintext hash of exam content is stored.
- The budget is 40 entries and 150 MB, evicted by `lastAccess` through the `[lastAccess+sizeBytes]` index, so eviction never reads a PDF.
- `clearCompileCache()` empties the table, so it is wiped on sign-out, workspace replacement and package changes.
- The table belongs to `vaultTables()` but does not count for `workspaceIsEmpty()`.

## Evaluated and rejected: exercises as packages

The claim was that TeX caches packages, so exercises loaded as `.sty` files would compile faster. TeX keeps no state between runs: a `\usepackage` or `\input` file is read and executed in full every time, like inline text. Measured on the 8-page exam (Tectonic, round-2 template, two series):

| Exercises | fresh | seeded |
|---|---|---|
| Inline (today) | 7.0-7.1 s | 2.4-2.7 s |
| One `\input` file each | 7.2-7.4 s | 2.6-2.7 s |
| `.sty` defining a macro, called in the body (6 of 9; listings cannot live in a macro) | 6.7-7.0 s | 2.4-2.6 s |

The three are equal within noise. Overleaf is fast because of server CPU and a project directory kept between compiles (aux reuse, which Examance does since #341), not because of a package cache. TeX's only cross-run cache is a dumped format, which helps only for what is the same in every compile (the template).

## Measured: TeX Live XeLaTeX, a dumped format and memoize (round 3)

Measured with TeX Live 2026 XeLaTeX in a scratch install; the server has used it since round 4. Times are one pass with seeded aux, best of three.

| Document | Tectonic | XeLaTeX | XeLaTeX + format | + memoize |
|---|---|---|---|---|
| The 8-page exam | 2.55 s | 2.03-2.15 s | 1.68 s | n/a |
| Same template, one task (fixed cost) | | | 0.85 s | |
| TikZ-heavy test exam (3 UML, 4 circuits, 2 plots, chemfig, 4 pages) | | 2.26-2.44 s | 1.55 s | 1.26 s |

- **Same output with the format:** XeLaTeX with the format matches XeLaTeX without it pixel for pixel at 300 dpi, on both documents.
- **How the format is dumped:**
  - XeTeX cannot dump OpenType fonts, and the kernel loads one as soon as the class selects a font.
  - The format is therefore built with `\fontencoding{OT1}`. Libertine is skipped while dumping (`packages.sty` would need a switch for that).
  - After `\endofdump` the document switches back to TU and loads Libertine, which costs 0.25 s.
  - The format holds everything up to and including the template load, `\ExamancePackages` included, so one is needed per distinct preamble.
- **Where the TikZ-heavy exam spends a pass (without format):** template and text 1.20 s, subject packages +0.58 s, the ten pictures +0.48 s. The format removes most of the package share.
- **Memoize is rejected:**
  - It saves only 0.25-0.3 s per pass.
  - It needs an extraction script between runs, and the stock `memoize-extract.py` fails on xdvipdfmx output (inherited MediaBox) until patched.
  - It broke the layout: memoized chemfig formulas came back with a wrong size, and the line wrapped differently.
  - It would also need the `antworten` switch in each memo's context and drops links inside pictures.

## Round 4: the server on TeX Live

The server engine moved from Tectonic (TeX Live 2022 bundle, files downloaded on demand) to a pinned TeX Live 2026 XeLaTeX installed in the backend image (`backend/latex-texlive/`, `docs/hosting.md` section 4.5). Server and browser engine now use the same TeX Live year.

- **Passes.** `services/texrunner.py` runs XeLaTeX with `-no-pdf` until `main.aux`, `.toc` and `.out` settle (at most 4 passes, seeded from the previous compile's aux), then `xdvipdfmx` once.
- **Format cache.** Per preamble, the document up to and including `\usepackage[..]{sty/Schulaufgabe}` is dumped once with mylatexformat. The key is the SHA-256 of preamble, assets and TeX Live snapshot; formats live in `LATEX_FORMAT_DIR` (volume `latex_formats`, LRU 64 formats / 2 GB). XeTeX cannot dump OpenType fonts, so the dump runs in OT1 and `packages.sty` skips Libertine through `\ExamanceDeferFonts`; fonts load after the dump. A failed format build falls back to a plain compile.
- **Warm-up.** `backend/latex-warmup/warmup.sh` compiles `warmup.tex` through the runner at image build (a missing package fails the build) and after a deploy; that builds the warm-up's format and seeds a new volume.

Measured on the 8-page exam inside the built image:

| | Seconds |
|---|---|
| One seeded compile with the format cached, student sheet / solution | 1.79 / 1.77 |
| Fresh compile (3 passes) | ~5.1-5.4 |
| First build of a format (extra, once per preamble) | ~1.3 |
| Tectonic before: one seeded pass / fresh (before #341) | 2.55 / ~17.7 |

**Page breaks can move.** TeX Live 2026 sets some vertical spacing a fraction of a millimetre differently from Tectonic's TeX Live 2022, so the same source can break pages elsewhere (one solution sheet went from 7 to 6 pages). Exams printed before the switch keep being read with their pinned print layout (issue #239).

## Done on the server: a precompiled preamble (.fmt)

Tectonic could not use one: `tectonic --outfmt fmt` dumps a custom format (23 MB for the template), but `--format` resolves format names only inside the bundle, never from the working directory. With TeX Live in the image the server does it (round 4 above); the format holds everything up to and including the template load, and the solution's `antworten` option gets its own format through the preamble key.

The browser engine (busytex) still compiles without a format: it would need an `-ini` dump inside the WASM VM and a matching cache invalidation. The remaining gain there is the preamble's share of one pass, roughly a second; it is not worth it until the cheaper measures above are exhausted.

## Why not Typst

Typst compiles incrementally because its compiler is built from memoised pure functions. TeX expands macros over global state (counters, page breaks, the aux file), so any change can move everything after it, and there is no "recompile page 3" mode. texpresso gets close by snapshotting a patched native TeX process, which cannot run in WASM or behind a server engine.

Switching to Typst would mean rewriting:

- the exam template and its OMR layout contract (score boxes, fiducials, page codes, bubble links);
- every teacher's exercise LaTeX, with sharing, copies and versions;
- both engines.

The measures above recover most of the difference for the edit-compile loop, at no cost to existing content.
