---
editLink: false
---

# Grading

Grading happens on the scan itself: you see the handwriting and the answers, mark them with a pen and stamps, and award points per exercise. Total and grade follow live from the grading key. Classes graded on paper are entered in a score grid instead.

## Grading blind {#blind}

During the grading pass you see **"Anonymous student #3 of 26"**, never a name. That is the core of the method: the assessment is made without knowing the person. Names come back only where you need them afterwards, for the grade list and the export.

![Blind grading](../screenshots/pitch/06-grading.jpg)

## The grading view {#workspace}

- **All pages of a submission are stacked.** Scroll through them with the mouse wheel or the scrollbar, or with **two fingers** on a touch device (one finger draws).
- **Ctrl + mouse wheel** or pinching zooms; **Fit** fits the page to the view. The page arrows jump between pages.
- **Crop margins** hides the empty page margins for a larger view.
- **Previous** and **Next student** move through the submissions.

The **Scoring** panel lists the exercises with their points. Click a row to make it the **stamp target**: stamps you place then count towards that exercise.

## Pen and stamps {#tools}

Correction marks are drawn on a separate layer above the scan. The original stays untouched and can be shown without annotations at any time.

| Tool | Does |
|---|---|
| **Pen**, **Line**, **Eraser** | Freehand marks in red, straight lines, erase |
| **+1.0**, **+0.5**, **+0.25** | Correct, half or quarter correct: adds the points to the stamp target |
| **−1.0**, **−0.5**, **−0.25** | Deductions |
| **Wrong**, **Missing** | Marks without points |
| **WF**, **FF** | Repeated error, follow-on error |
| **Clear** | Removes every drawing and stamp on the page and resets the computed points |

You can also type an exercise's points directly. **Reset to ungraded** clears a row again.

## Points, total and grade {#scores}

Points are awarded **per exercise**. The total and the grade are recalculated continuously from the exam's [grading key](./exams#grading-key). Next to the grade, Examance shows how many points are missing for the next better grade, and the buffer before the next worse one.

A submission counts as **partly graded** until every exercise has points. Partly graded submissions already appear in the statistics with a provisional value, see [partially graded submissions](./results#partial).

## Grading part by part {#parts}

For an exercise with [parts](./exercises#parts), the scoring panel shows one row per part (**Part a)**, **Part b)**, …) below the exercise. Click a part's row to make it the stamp target, so stamps count towards that part, or type its points.

![Part rows in the scoring panel and filled score boxes on the scan](../screenshots/guide/grading-parts.jpg)

- The exercise's own field then reads **Follows from the parts once all of them are graded**: the exercise counts as graded only when every part has points.
- Points outside the parts (for example a scoring unit in the introduction, or stamps set while the exercise itself was the target) are collected in the row **Outside the parts**. If it gets more points than the exercise has outside its parts, the row warns you: probably a stamp landed without a part.
- You can still grade the exercise as a whole: just leave the part rows empty.

## Score boxes fill in by themselves {#score-boxes}

The exam prints a score box next to each exercise and each part, and a table at the end with every exercise, the total (Σ) and the grade. While you grade, Examance writes the points into these boxes on the scan, and into the graded PDF you export or hand back. An exercise's box is filled once it is graded; the total and the grade follow when the submission is complete. You never fill in the table by hand. If the exam was changed after its answer-sheet template was created, the boxes stay empty, because the printed sheet no longer matches.

## Multiple choice while grading {#multiple-choice}

For single and multiple choice questions the detected ticks are applied automatically, including the exercise's penalty for wrong ticks. You can review and correct them before saving.

The thorough way to check detections is the **Check MC** step, which lists unsure detections first, see [MC verification](./scanning#mc-verification). If a page could not be aligned, the grading view says so: grade that exercise by hand.

## Classes graded on paper {#paper}

Not every exam needs scans. On the **Paper & Excel** step you enter points directly:

- **Exercise-first entry**: all students for one exercise, then the next exercise.
- **Student-first entry**: all exercises of one student, then the next student.
- **Student roster**: add students one by one or paste a whole list.
- **Import from Excel (Ctrl+V)**: select the cells in Excel or Google Sheets, copy them and paste them here. Examance shows a preview, can create missing students in the roster automatically, and then fills the grid.

These results take part in statistics, analytics and export like scanned ones.

![Pasting points from a spreadsheet](../screenshots/pitch/08b-paper-entry.jpg)

## Saving {#saving}

**Save grade & annotations** stores the points and the marks, encrypted. Switching to another student or leaving the page with unsaved annotations asks first: confirm only if you really want to discard them.

If the connection drops, changes that could not be sent are queued in the browser and sent automatically later.
