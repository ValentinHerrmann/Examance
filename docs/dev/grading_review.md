# Grading review (objections through the result link)

Issue #226. A student who opens their graded exam through the result link (`docs/dev/result_sharing.md`) can object to the grading of each (sub)exercise; the teacher replies, may change the grading and republishes the result under the **same** link. The server only ever stores ciphertext.

## Flow

1. **Share with objections.** The Share page's options step offers "Allow objections until `<date>`" (off by default, 14 days preset, never after the link's expiry). `shareResults` sends `review_until` and a `wrapped_key` with every share, and the sealed header (v3) lists the gradable items.
2. **Student objects.** The result page (`components/sharing/ReviewForm.svelte`) shows one textarea per item (500 characters each, hard limit on both sides). Submitting seals the objection and posts it. Until the teacher opens it, the student can edit (post again) or withdraw it; after `opened_at` or `review_until` it is locked.
3. **Teacher is notified.** An in-app badge on the exam's Results nav counts open objections (`GET /exams/{id}/reviews`). Unless the teacher switched it off in the settings (`teachers.review_mail`, null = on), the server mails them per objection (at most once per link and hour, so resubmits cannot flood the inbox): exam title and a link only, never student data.
4. **Teacher answers** on the grading page, pseudonymously: `ReviewThread.svelte` under each score row. Opening the submission's review marks it opened (`POST …/review/open`), which locks it for the student. "Send reply" saves the scores, re-renders and re-seals the graded PDF under the same link (`republishShare`), seals and stores the reply, saves the `GradingReviewRecord` and, when the student has an e-mail address, mails them through the result mail path (`kind: "review_reply"`).
5. **Student reads** the reply per item and the points change on the same link. The page shows "Grading updated on `<date>`" (`content_updated_at`).

Score edits outside a reply are never published automatically: the Share page's "Update shared result" row action calls the same `republishShare`.

## Keys

All derivations live in `lib/sharing/shareCrypto.ts`.

| Value | Derivation |
|---|---|
| content key | as before (`examance-share-key:v1:<factor>`), but derived as raw bits so it can be wrapped |
| `K_wrap` | `HKDF-SHA-256(data key, salt "examance-share-wrap-v1", info "share-wrap")`: only this account can unwrap; the data key is stable across password changes |
| `wrapped_key` | `iv(12) ‖ AES-GCM(K_wrap, token(16) ‖ contentKey(32))`, AAD `share-wrap:v1:<shareId>`; stored on the share row |
| `K_review` | `HKDF-SHA-256(contentKey, salt shareId, info "examance-share-review:v1")` |
| objection | AES-GCM under `K_review`, AAD `review:v1:<shareId>:objection`, plaintext JSON `{items: {[key]: text}}` |
| reply | AES-GCM under `K_review`, AAD `review:v1:<shareId>:reply`, plaintext JSON `{items: {[key]: {text, pointsBefore, pointsAfter}}}` |

Why the content key and not the token: with factor `sticker`/`code` the content key also needs the code, so a third party that carried the link (mail provider, Artemis, our server) can neither read nor forge an objection. With factor `none` (slips only) whoever holds the link can, which is the same trust as reading the result. The token is wrapped too, so the teacher can put the link into the reply mail. Shares made before this feature have no `wrapped_key`: they stay readable but cannot be updated or carry objections; the Share page marks them "share again for an updatable link".

## Sealed header v3

`ShareHeader` gains `items: ReviewItem[]`, built in `shareResults`:

```ts
interface ReviewItem { key: string; label: string; max: number; points: number | null }
```

- `key` is the exercise id, or `${exerciseId}#${partLabel}` for a part (`partOverrideKey`, `grading/partScores.ts`); MC group members are their own exercise ids.
- `label` is the position number plus the part or MC sub-label ("3", "3a").
- A header without `items` (v1, v2) shows no form.

## Server

- `result_shares` gains `wrapped_key` (nullable bytes), `content_updated_at` and `review_until` (nullable timestamps).
- `result_share_reviews` (1:1 with the share, `ON DELETE CASCADE`) holds `objection_iv`, `objection_ct`, `submitted_at`, `opened_at`, `reply_iv`, `reply_ct`, `replied_at`. It dies with the share: link expiry, revocation, re-share, exam or account deletion.
- Teacher endpoints (`get_teaching_teacher`, not gated by `server_results`, like shares):
  - `PUT /exams/{id}/shares/{share_id}/content {iv_b64, ciphertext_b64}` re-seals in place; lookup, factor and salt stay, `content_updated_at` is set. Refused (409 `ERR_SHARE_NOT_UPDATABLE`) for a share without `wrapped_key`.
  - `POST /exams/{id}/shares/{share_id}/review/open` sets `opened_at`.
  - `PUT /exams/{id}/shares/{share_id}/review/reply {iv_b64, ciphertext_b64}` stores the reply.
  - `GET /exams/{id}/reviews` lists every review of the exam: share id, student key, timestamps and ciphertexts.
- Public endpoints (no session, 10/minute per IP, body cap `BODY_LIMIT_SHARE_REVIEW`):
  - `POST /shares/{id}/review {lookup_b64, iv_b64, ciphertext_b64}` creates or replaces the objection.
  - `POST /shares/{id}/review/withdraw {lookup_b64}` deletes it.

  Both refuse after `opened_at` or `review_until` with 409 `ERR_REVIEW_CLOSED`. Unknown, expired, revoked, wrong-lookup and objections-disabled shares all answer the uniform `404 ERR_SHARE_NOT_FOUND`.
- `POST /shares/{id}/open` also returns `content_updated_at`, `review_until` and `review` (`{objection_iv_b64, objection_ct_b64, submitted_at, opened_at, reply_iv_b64, reply_ct_b64, replied_at}` or null).
- Audit: `REVIEW_SUBMITTED` (public, teacher of the share), `REVIEW_REPLIED`.

## Results record

The thread is personal exam data and must outlive the link, so "Send reply" also saves a `GradingReviewRecord` that follows the storage mode like scores do (`repositories/reviewRepository.ts`; server table `grading_reviews`, gated by `server_results`):

- plain: `id`, `submissionId`;
- sealed: `items: [{key, label, objection, reply, pointsBefore, pointsAfter}]`, `submittedAt`, `repliedAt`.

One record per submission, sealed as one payload like a score (`payload_ciphertext_b64`, `payload_iv_b64`, AAD bound to the submission id). Endpoints:
- `GET /exams/{exam_id}/grading-reviews`
- `GET`, `PUT` (idempotent upsert `{id?, payload_ciphertext_b64, payload_iv_b64}`) and `DELETE /exams/{exam_id}/submissions/{submission_id}/grading-review`

The record goes through `resultsMover`, the trash, archives, the GDPR subject access export, and the submission and exam cascades.

## Printing the review in exported PDFs

`renderGradedPdf` takes `review?: {items, options}` (`lib/export/reviewPrint.ts`). `options` is a `ReviewPrintOptions { short, strip: 'none' | 'side' | 'bottom', summary, attach }`; the parts combine freely, nothing ticked prints nothing (and loads no reviews, `loadReviewItems`):

| Option | What it prints |
|---|---|
| `short` (preselected) | "Einsicht: 3 -> 4 P." in small red text right under the exercise's score box: no extra space, the scan is not covered |
| `strip: 'side'` | pages holding an item with an objection get a 55 mm strip on the outer side (the page gets wider, the scan is untouched); objection, reply and points sit level with the exercise's score box |
| `strip: 'bottom'` | such pages get a 40 mm strip at the bottom; the items stand side by side in reading order, each under its score box's x where it fits (`bottomColumns`) |
| `summary` | one summary page appended at the end |
| `attach` | the full thread as the text attachment `review.txt`, so a cut-short text is never lost; without it the cut-off marker no longer points to an attachment |

Rules:
- **One strip.** Side and bottom exclude each other (`toggleReviewOption`); short notes are drawn on the scan whichever strip is on. A page grows only when it has a placed item (`stripGeometry`).
- **Shown only with objections.** `components/export/ReviewPrintOptions` renders the tiles only when the exam (on the Scan page: the student) has a printable objection (`examHasReviews`, `printableReviewOf` in `reviewService`), otherwise one line; an unreadable read shows nothing.
- **Remembered per browser** (`reviewPrintPrefs.ts`, scope `export` for the export dialog, the Archive tab and the Scan page, scope `share` for the Share page); unreadable storage means the default.
- **Combined print PDF.** Merging drops attachments, so the attachment tile is greyed out with its reason there and `renderCombinedGradedPdf` never attaches. In the ZIP list it is greyed out while only the combined file is chosen.
- **Student's copy.** The Share page offers the `share` choice (attachment greyed out: students view the PDF without attachments); `shareResults` uses it and `republishShare` (Send reply, Update shared result) reads the remembered `share` choice; `shareReviewOptions` forces `attach` off.
