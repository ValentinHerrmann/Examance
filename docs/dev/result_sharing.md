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

- **Layout.** The exam option `cut_corner` (Schulaufgabe.sty `schnittecke`) keeps free every corner a guillotine through the stack can cut: the top-right corner of odd pages (all print modes) and both top corners of even pages (top right single-sided, top left duplex and booklet). The layout does not depend on the print mode, because the OMR template is captured once per exam; odd pages give their top-left corner back to the header (marker in the corner, usual 1 cm indent). The cut line runs from 75 mm left of the top-right corner to 20 mm down the right edge; moved 3 mm outward as tolerance it gives an 86.6 × 23.1 mm triangle, mirrored at the top left. `\geometry{top=10.5mm}` (headheight 30pt, headsep 0) starts the body at about 21.1 mm, below the zone (20.4 mm deep at the 10 mm margin), at +6.5 mm per page. The 3 mm tolerance and 3 mm text clearance are what keep this small: with 5 mm and 4 mm the body had to start at 28.1 mm; a guillotine with the stack clamped along the dashed line stays well within 3 mm. Header cells on a side that may be cut indent 5.2 cm (57 mm from the edge: page 1's date, even pages' running head), the head rule spans only the text width, and page 1's title is raised 11 mm into the band between the zones (`\raisebox`, max 80 mm wide). The top-right marker sits 46–54 mm from the side and 12–20 mm from the top on every page; the top-left one does the same on even pages and stays in its corner on odd pages; the bottom pair is unchanged. The QR box drops its caption and initials field. Without the option the layout is unchanged pixel for pixel. Geometry constants live in `lib/qr/cutCorner.ts` and mirror the sty.
- **Tab.** `drawCornerTab` (`qr/examCopies.ts`) draws page 1's tab: the dashed line, name (Helvetica-Bold 9 pt, shrinking to 7 pt before it is shortened) and key (Courier-Bold 8.5 pt) horizontal and right-aligned 4 mm from the right edge, each row limited so its descender stays 3 mm (perpendicular) from the line and 4 mm from the edges, and a small rotated hint in the tolerance band outside the line. Every other page gets only the dashed line (`drawCutLine`), top left on even pages of a duplex copy and top right otherwise.
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

**Channels.** `lib/sharing/channels.ts` lists how results reach students. Each channel names the factors it carries and which students it cannot reach. The dialog mutes factors that no chosen student can use, and shows the reason (`incompatibleStudents`). Only `slips` exists today. To add e-mail, Artemis or Moodle/Mebis, register a channel there, give it its own delivery step in `shareService`, and add its compatibility rule (for example, Artemis needs a numeric Artemis user id as the sticker id). E-mail can only send the link: the server cannot attach a PDF it cannot read.

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
