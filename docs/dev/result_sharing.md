# QR stickers and result sharing

Issues #207 and #83. Teachers print QR name stickers for the exam sheets and later give each student their graded PDF through a personal link. The server only ever stores ciphertext it cannot open.

## QR name stickers

- `lib/qr/stickerSheet.ts` (`renderStickerSheet`, `entriesFromRoster`) draws an A4 sheet of 5 × 7 labels with pdf-lib. QR codes are vector modules from the bundled `qrcode` package (`lib/pdf/labelKit.ts` `drawQr`); there is no external QR service, because the CSP allows `script-src 'self'` only.
- The payload is `Lastname, Firstname_ID` (`formatStudentQr` in `utils/studentQr.ts`), which is also the DiRueLei format. `parseStudentQr` reads it back, and the scanner stores the whole text as the student's raw id (`pseudonymRaw`).
- If a pasted line has no id, `stickerId(name)` (`crypto/stickerKey.ts`) derives a stable 6-character id from the name, so a reprint gives the same sticker.
- **Personal keys.** With the option on, each student's first sticker carries a strip with name and key (`personalKey(raw)`, so no storage) above the QR code, behind a dashed cut line; the teacher cuts it off before the sticker goes onto the paper, so no label is spent on the key. Students who already carry a sticker (DiRueLei or an older sheet) get key slips only, on plain paper (`renderKeySlips`). Key slips and the share code slips are drawn by one `labelKit.drawKeySlip`.
- `K_sticker = HKDF-SHA-256(data key, salt "examance-sticker-v1", info "sticker")`. Ids and keys are HMACs under it, so only this account can reproduce them, and a reprint always matches.
- Students added by hand or opened from unmatched pages have a minted UUID as their raw id. They carry no sticker, so `stickerRawOf` returns null for them.

## QR codes printed on exam copies

Issue #211. Instead of stickers, `lib/qr/examCopies.ts` (`renderExamCopies`) stamps each student's code onto a copy of the compiled student sheet; the sticker dialog offers it as a second output.

- **Layout.** Every exam (Schulaufgabe.sty; there is no option, so the OMR template never depends on how sheets were printed: the former opt-in `schnittecke` is a no-op and `exams.cut_corner` was dropped in 0053) keeps each page's outer top corner free (top right on odd pages, top left on even ones), the corner a guillotine through a long-edge duplex or booklet stack cuts. Copies are always printed that way (there is no single-sided option: a single-sided stack would cut the mirrored even pages' header). The cut line runs from 75 mm left of the corner to 20 mm down the side; moved 3 mm outward as tolerance it gives an 86.6 × 23.1 mm triangle. `\geometry{top=11.9mm,left=5mm,right=5mm}` (headheight 30pt, headsep 0) widens the text to the markers' outer edges (200 mm) and starts the body at 22.4 mm, below the zone (21.8 mm deep at the 5 mm text edge): 7.9 mm lower than the former layout, 10 mm wider. The fancyhdr offsets drop to 0, so the head keeps its 5 mm edge distance, and `\SA@headgap` (1.5 cm) keeps the header cells 20 mm from the paper edge. The body cannot wrap around the markers or the zone (a diagonal top or bottom notches): TeX builds lines before it breaks pages, so it cannot know which lines land in a page corner (wrapfig works only because its figure is anchored in the text), and answer boxes, grids and MC tables span the full width. The points table is the one known block at a known place: it fills the strip between the bottom markers (181 mm wide, 1.5 mm clear of them, so the scanner never sees a merged blob) and ends level with their bottom edge, lowered 9 mm with zero declared depth so page breaks stay put (`\SA@scoretable`; `\ExamNotes` reserves 9 mm less). The page number therefore moves into the header as "Seite X" on the cut side, 20 mm from the edge like the title opposite (none on page 1). The guide's true-scale sketch (`docs/screenshots/guide/cut-corner-layout.py`, `exams#cut-corner`, linked from the exam editor) mirrors these numbers; regenerate it when they change. The 3 mm tolerance and 3 mm text clearance are what keep this small. The header mirrors on even pages (running head on the uncut side); page 1's header (`\SA@firsthead`) has the logo, then the title with course, date, duration and teacher in one smaller line centred under it (separate items joined by a centred dot, empty ones left out: `\SA@infoline`; `\SA@splitdatum` splits the duration off `\Datum`'s brackets inside the sty, so exam sources and their OMR template hashes stay unchanged). The QR box and the info text fill the text width, the box flush with the markers' outer edge (`\Namenszeile`), in the room up to 62 mm from the cut side (each scaled down only if it does not fit). The head rule spans only the text width. Both top markers sit 12–20 mm from the top: the one by the cut corner 46–54 mm from its side, the other at the usual 5 mm inset; the bottom pair is unchanged. All four stay: with three, registration falls back to an affine fit that the OMR worker always flags as uncertain, and template prep rejects pages with fewer than four. The QR box keeps its caption and initials field for spare plain copies; `examCopies.ts` blanks them under the stamped code. The tab is tinted light grey (`black!7`) on every page; personalised copies blank page 1's tab under name and key, and their cut line carries vector scissors (no font) instead of a text hint. Exams printed under the former layout keep their stored OMR template until an edit re-captures it (the hash covers `main.tex`, not the `.sty`). Geometry constants live in `lib/qr/cutCorner.ts` and mirror the sty.
- **Tab.** `drawCornerTab` (`qr/examCopies.ts`) draws page 1's tab: the dashed line, then name (Helvetica-Bold 9 pt) and key (Courier-Bold 8.5 pt) parallel to it on the corner side, each row's descender 3 mm (perpendicular) from the line and its ascender 4 mm from both paper edges, centred in the room that leaves. A long name shrinks to 7 pt, then its given names become initials (`abbreviateGivenNames`, `utils/studentQr.ts`: "M. Mustermann-Müller"), and only then is it shortened; the key always fits. A small rotated hint sits in the tolerance band outside the line. Every other page gets only the dashed line at its outer corner (`drawCutLine`), and an odd copy gets a blank back page.
- **Stamping.** The sticker box is found through its `omr://__qr__` link (`parseOmrUri` ignores it). The payload is the sticker payload, so personal keys and sharing are unchanged. Name, key and a hint run parallel to the cut line, at least 4 mm inside it and 4 mm from the paper edges; a long name shrinks to 7 pt before it is shortened. With duplex, odd copies get a blank page.
- **Covering.** On ingest (`scan/ingest.ts`, `IngestDeps.cutCorner`), each booklet's QR page is aligned against the moved fiducials and the reserved zone, grown to the image edges, is painted white on the stored page (`cornerCoverPolygon`). The zone is blank apart from the tab, so it is always covered, cut or not; an unaligned page gets the nominal zone. The original pixels stay under the white shape inside the sealed scan.

## Sharing

The flow lives in `lib/sharing/shareService.ts`:

1. `loadResults` and `forEachGradedPdf` from `export/examExport.ts` render each chosen student's PDF with `renderGradedPdf`. The ZIP export uses the same loop. Scans are fetched one submission at a time (`submissionRepository.getById`), so memory holds one scan and an unreadable scan (a missing file answers 503 `ERR_BLOB_STORE_UNAVAILABLE`) becomes a warning for that student instead of failing the run. Results come through the repositories, so sharing works in both storage modes.
2. `shareCrypto.ts` mints a link `/result#<shareId>.<token>` (16 random bytes) and seals the PDF.
3. `api/resultShares.ts` uploads the ciphertext with `POST /exams/{id}/shares`.
4. `slipsPdf.ts` prints one slip per student with the link's QR code.

**Keys.** The link fragment never reaches the server.

| Value | Derivation | Who holds it |
|---|---|---|
| lookup secret | `HKDF(token, salt = shareId, info "examance-share-lookup:v1")` | the student sends it to fetch the ciphertext; the server stores only its SHA-256 (`lookup_hash`) |
| content key, factor `none` | `HKDF(token, salt = shareId, info "examance-share-key:v1:none")` | the link |
| content key, `sticker`/`code` | `HKDF(token ‖ Argon2id(code, kdf_salt), salt = shareId, info "examance-share-key:v1:<factor>")` | link plus code; `kdf_salt` is random and stored with the share |

**Sealing.** AES-256-GCM, AAD `share:v1:<shareId>`. The plaintext is `[u32 header length][header JSON {filename, examTitle, documents: [{kind, length}]}][documents…]`: the graded PDF, then the sample solution when the teacher ticked it (compiled once per run with `compileExamPreview`; a failed compile ends the run before anything is uploaded). A header without `documents` (v1) is one graded PDF.

**Codes** have 8 characters from the `randomCode` alphabet (32 letters, 40 bits) and are printed as `ABCD-EFGH`. The token carries the security: someone without the link cannot even fetch the ciphertext. The code protects against a forwarded link, and Argon2id makes guessing it offline expensive.

**Factors**, chosen per share in the dialog:
- `none`: the link alone opens the PDF.
- `sticker`: the personal key from the sticker sheet.
- `code`: a fresh code per student, printed on separate code slips so it can be handed out apart from the link. The code is never stored; if one is lost, share that student again.

**Channels.** `lib/sharing/channels.ts` lists how results reach students. Each channel names the factors it carries, which students it cannot reach and the account switch it needs. The dialog mutes factors that no chosen student can use, and shows the reason (`incompatibleStudents`). See [Delivery channels](#delivery-channels).

## Delivery channels

Issue #209 adds e-mail and Artemis next to the slips, and file-based Mebis support, modelled on DiRueLei.

| Channel | Delivery (`sharing/delivery.ts`) | Factors | Cannot reach |
|---|---|---|---|
| `slips` | link slips PDF | `none`, `sticker`, `code` | nobody |
| `email` | links collected, sent in batches of 100 via `POST /integrations/mail/results` | `sticker`, `code` | students without `email` |
| `artemis` | per student `POST /integrations/artemis/messages` (link mode) or `/files` (PDF mode, no share is made) | `sticker`, `code` (ignored in PDF mode) | students without a numeric sticker id (`lmsIdOf`) |

**Why no `none`:** e-mail and Artemis hand the link to a third party: our server, the mail provider and Artemis. With a second factor that party holds the token but not the code, so it still cannot derive the content key. On these channels the code factor prints only the code slips (`renderShareSlips` with `codesOnly`), for handing out in class.

**Student contact data.**
- `StudentRecord.email` is sealed like the name (`db/dbEncryption.ts`), so it follows the account's storage mode.
- `lmsIdOf(student)` (`utils/studentQr.ts`) reads the Mebis participant id or Artemis user id from the sticker payload. It strips DiRueLei's `Teilnehmer/in` prefix.
- Class lists from every source become `Contact[]` (`lib/lms/contacts.ts`):
  - a Mebis grading worksheet or participant CSV (`contactsFromMebisCsv`);
  - pasted lines (`contactsFromLines`);
  - Artemis course members (`fetchArtemisStudents`).
- `matchContacts` pairs contacts with students by sticker id first, then by unambiguous name. The sticker dialog fills its list from a contact source; the share dialog saves matched addresses (`DeliverySetup.svelte`).

**Preview.** Before an e-mail or Artemis run, `DeliveryPreview.svelte` shows:
- every student with their recipient and what they get;
- who is skipped and why;
- which data goes where.

Nothing is sent before the teacher confirms.

**Artemis relay** (`backend/app/services/artemis.py`, `routers/integrations.py`).
- It is a fixed client, not a proxy. There is no URL parameter. It calls only hosts in `ARTEMIS_ALLOWED_HOSTS` and only these endpoints:
  - `course/courses/{id}/students`, falling back to the older `core/courses/{id}/students` on a 404: Artemis moved it to its `course` module in 2026, and other instances update later;
  - `communication/courses/{id}/one-to-one-chats`;
  - `core/files/courses/{id}/conversations/{conv}`;
  - `communication/courses/{id}/messages`.
- The teacher's token (the `jwt` cookie, pasted per run; host and course id are remembered in the browser) is sent as a bearer. It is never stored or logged.
- An upstream 401/403 or redirect becomes `400 ERR_ARTEMIS_AUTH`. A 401 from our API would read as an expired session.
- Every other failure becomes `424 ERR_ARTEMIS_UPSTREAM`, or `ERR_ARTEMIS_TIMEOUT` after the 20 s deadline per operation. It is never a 502 or 504: a proxy in front (Cloudflare, Caddy) may swap those for its own page without CORS headers, and the browser then reports a CORS error instead of the cause.
- Each failure logs the step (`students`, `chat`, `upload`, `message`), the host, and the upstream status or error class. Grep the backend log for `Artemis relay`.
- The 424 detail says `Artemis returned HTTP <status> (<step>)`, plus Artemis's own `errorKey`. The dialog shows it next to the translated message (`artemisErrorText`), so an endpoint move shows up without server logs.
- **When Artemis moves an endpoint again**, look it up in `ls1intum/Artemis`: the `@RequestMapping` prefix of the `*/web/*Resource.java` class plus the method mapping.

**Mebis.** There is no API (DiRueLei has none either).
- The readable exam export has an optional part `mebis`: a nested `<exam>_mebis_feedback.zip` with `Participant_<id>_assignsubmission_file_/<name>_<id>.pdf` per student (`mebisFeedbackPath`).
- The teacher uploads it under "Upload multiple feedback files in a zip".

**Sticker sheet versus DiRueLei.** Both use the same label stock, so partly used sheets work in either app:
- A4, 5 × 7 cells of 3.5 cm, 0.5 cm gaps, margins 0.7 cm left and 1 cm top.
- Examance draws a larger vector QR code with the name above it; DiRueLei draws 2 cm with the name below.

## Server

- **Storage.** `result_shares` (`models/result_share.py`, read and written only by `services/result_shares.py`) holds:
  - `student_key`, the student's version-2 pseudonym from `joinKey`, which is stable across a re-key;
  - `lookup_hash`, `factor`, `kdf_salt`, `iv`, the ciphertext and `expires_at`.

  The ciphertext lives in the `shares` blob kind or in the deferred `ciphertext` column, following `BLOB_STORAGE_BACKEND` like scans do.
- **Replacing.** Sharing a student again replaces their row, so the old link dies.
- **Teacher endpoints.** `POST/GET/DELETE /exams/{id}/shares` (`DELETE ?student_key=` revokes one student) and `DELETE /exams/{id}/shares/{share_id}`. They depend on `get_teaching_teacher` and are not gated by `server_results`: the server can never read a share.
- **Public endpoint.** `POST /shares/{id}/open {lookup_b64}` needs no session and is limited to 30/minute per IP. Unknown, expired, revoked and wrong-lookup requests all answer the same `404 ERR_SHARE_NOT_FOUND`.
- **Lifetime.**
  - A teacher picks 7, 14, 30 or 90 days (`RESULT_SHARE_EXPIRY_DAYS`).
  - The retention run deletes expired shares (step 14) and sweeps orphaned files.
  - Deleting an exam deletes its shares outright. They are not captured into the trash, because a restored exam must not revive links.
  - Deleting a student revokes their link: server side for version-2 keys, and from the client in every mode (`studentRepository.delete`), because a hybrid delete never reaches the server.
  - Account deletion drops the files with the cascade.
- **Hybrid accounts.** This is the only path on which result data, as ciphertext only, reaches the server in `hybrid` mode. The dialog says so.

## Student page

`routes/result/+page.svelte` is a public path (`isPublicPath`, exact match `/result`). It runs these steps:

1. Parse the fragment.
2. Derive the lookup and fetch the ciphertext.
3. Ask for the code when the factor needs one.
4. Decrypt in the browser and show the PDFs view-only: `PdfEmbedViewer`, or `DualPdfPreview` with `downloadable={false}` when a solution is included (EmbedPDF's export and print are disabled). This deters casual downloading only; the bytes are in the student's browser.

A wrong code fails GCM authentication and shows "key incorrect". The page sets `noindex` and `no-referrer`.
