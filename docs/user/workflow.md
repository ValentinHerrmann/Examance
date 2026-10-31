---
editLink: false
---

# From exercise to analysis

The usual path of an exam through Examance, in six steps. Each step links to its detailed page.

## 1. Collect exercises in the library {#library}

Exercises live in your library, tagged by grade, subject and topic, so you reuse them instead of copying. Each exercise is a LaTeX fragment with a live preview; its score is counted from the source automatically.

- **Variants** are equivalent phrasings of the same exercise (for example groups A and B); they are analysed together.
- **Versions** keep the revision history: a reworked exercise does not invalidate the analysis of past exams.
- **Multiple choice**: single and multiple choice exercises store their options and answer key, and are detected automatically on the scans.
- **Sharing** (if your installation allows it): share an exercise with all accounts of the installation, copy exercises others shared, and propose improvements back to the original.

More: [Exercise library](./exercises), [Sharing exercises](./sharing).

![Exercise library](../screenshots/pitch/02-library.jpg)

## 2. Assemble and typeset the exam {#exam}

**New exam** asks for the header data (subject, class, exam type, date), then opens the exam page, where you pick exercises from the library, order them, group multiple choice questions and set the grading key. Typesetting produces a print-ready PDF with QR codes, one per exam, variant and student slot, in your browser or on the server.

**Duplicate** creates a new exam with the same exercises and settings, for example for a parallel class; students and results are never copied.

More: [Creating an exam](./exams).

![Exam builder](../screenshots/pitch/04-exam-builder.jpg)

## 3. Print, write, scan {#print}

Print the sheets exactly as typeset (no scaling); the QR codes must stay readable. After the exam, scan the whole stack into one PDF on the school copier.

More: [Print](./exams#print), [Scan the stack](./scanning#scan).

## 4. Import the scan {#scan}

Upload the PDF on the exam's **Scans** step. Examance splits it into submissions along the QR codes and encrypts every page in the browser right away. The QR code points at a pseudonym, not a name. Pages with unreadable codes are assigned by entering the fallback code printed on the sheet.

Ticked multiple choice boxes are detected during import. In the MC verification view you confirm or correct uncertain detections.

More: [Scanning and assignment](./scanning).

![Scan import](../screenshots/pitch/05-scan-import.jpg)

## 5. Grade blind {#grade}

While grading you see the handwriting and the answers, but not the name. Correction marks are drawn on a layer above the scan (the original stays untouched), points are awarded per exercise, and total and grade follow from the grading key. Papers graded without scanning are entered in a score grid or pasted from Excel.

More: [Grading](./grading).

![Grading](../screenshots/pitch/06-grading.jpg)

## 6. Results, analysis and export {#results}

- **Exam statistics**: grade and percentage distributions, average, pass rate, borderline cases, per-exercise analysis and variant comparison.
- **Analytics across exams**: topic heatmaps, exercise quality and variant fairness over time, grades and subjects.
- **Export**: CSV for the school's grade management (it contains real names), or a readable ZIP with the graded submissions as PDFs with the corrections drawn in, the LaTeX source and a statistical summary.
- **Backup**: a password-protected `.examance` archive backs up or moves a whole workspace.

More: [Results and analysis](./results), [Backup and transfer](./backup).

![Results](../screenshots/pitch/08-results.jpg)
