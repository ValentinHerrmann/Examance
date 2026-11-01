---
editLink: false
---

# Scanning and assignment

After the exam, the whole stack of written sheets becomes one PDF. Examance splits it into one submission per student along the QR codes, encrypts every page in your browser and detects the ticked boxes of multiple choice questions.

## Scan the stack {#scan}

- Scan the **whole stack into one PDF** on the school copier. Several PDFs work too; you can upload them together or one after the other.
- Order does not matter: the QR codes tell Examance which page belongs to whom.

![Synthetic scanned exam page](../screenshots/pitch/17-scanned-sheet.jpg)

## Import the scans {#import}

On the exam's **Scans** step, **Select Scan Files (PDF only)** reads the files. Examance

1. reads the QR code on every page,
2. groups the pages into one submission ("booklet") per student slot,
3. **encrypts every page in the browser** before it is stored.

In hybrid mode the scans never leave your device; in "All on the server" mode they reach the server only as ciphertext. (The one optional exception are anonymised crops of single tick boxes, if you switched on [Improve MC detection](./settings#donation).)

The list below shows every imported submission. From there you can preview a scan, export it as a PDF, **Split** a booklet that was merged by mistake, delete a grading or delete the scan.

![Scan import](../screenshots/pitch/05-scan-import.jpg)

## Pseudonyms, not names {#pseudonyms}

The QR code points at a **pseudonym**, not at a name. The link between person and submission is stored separately, encrypted, and is used only after grading (for the grade list and the export). That is what makes [blind grading](./grading#blind) possible.

## When assignment fails {#assignment}

Pages whose QR code is unreadable or missing are listed under **Unmatched Submissions**. Each cover page carries a printed **fallback code** (such as `A-X7K2M9`): type it in and **Link Code** assigns the submission.

Typical causes are a crumpled or folded corner, a code covered by handwriting, or a page printed with scaling.

## Verify MC detections {#mc-verification}

Ticked boxes are detected automatically during the import, including withdrawn crosses (a completely filled box) and boxes chosen again (a cross just left of a filled box); the exam option [How to correct a cross](./exams#mc-hint) prints these rules on every multiple choice task. The **Check MC** step lists every detection in three queues:

- **a) Failed detections**: the page could not be aligned; award these points in the [grading view](./grading#multiple-choice).
- **b) Unsure / ambiguous detections**: please look at each of them.
- **c) All other detections**: confident ones; no action needed.

Open an item to see the crop of the question on the scan, the answer options as printed and the detected marks. Confirm the reading, or toggle boxes to correct it. Every confirmed or corrected question counts as **verified**.

- Confirming keeps the stored score, including one you entered by hand; only toggling a box recomputes it. If the stored score differs from the answer key, the card offers **Apply answer-key score**.
- The view scores with the exercise's **current** answer key. If the number of boxes on the scan no longer matches the exercise (because it was changed after printing), the view says so and does not score the question; award the points in the grading view instead.
- **Spot-check** opens a random confident detection that nobody verified yet, so you can check unremarkable questions too.

![MC verification](../screenshots/pitch/07-mc-review.jpg)

### Unsure marks {#unsure}

Besides how full a box is, detection also looks at the **shape** of a mark:

- an evenly filled box counts as **withdrawn** (the usual way to cancel a cross);
- a mark reaching far beyond the box, or a very faint one, is flagged as **unsure**. The reason is shown next to the option.

Until it is verified, an unsure box counts provisionally as whatever its measurements are closer to, ticked or not ticked; the view says "Provisionally counted as ticked / not ticked". Unsure boxes keep their yellow frame until the question is verified.

![A scanned multiple choice page](../screenshots/pitch/18-scanned-sheet-mc.jpg)

## Re-run detection {#rerun}

**Re-run MC detection** evaluates all scans again with the current settings:

- **unverified** questions take the new result;
- **verified** questions keep your answer and score; only their detection is recomputed for comparison;
- manually entered scores are not touched.

A dialog first shows what will change and whether the settings differ from the last run. **Reset reviews** does the opposite: every question goes back to its original detection, and all confirmations and corrections are lost.

## Detection method and settings {#detection-methods}

Under **Settings → MC detection** you choose the method:

- **v4** (default) analyses the stroke shape;
- **v2** (older) measures the fill level; its shape analysis can be switched off.

The other method always runs alongside. The **Detection settings** panel of the verification view shows how many of your verified boxes each method would have read correctly, and compares the settings of the latest run with the ones a re-run would use. How to fine-tune the thresholds: [Fine-tuning MC detection](./settings#mc-detection).
