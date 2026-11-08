---
editLink: false
---

# Creating an exam

An exam is a selection of exercises from your library plus header data, a grading key and a few layout options. Examance typesets it as a print-ready PDF whose cover page has an empty **QR Code** box: each student sticks a QR name sticker into it (see [QR stickers](./students#qr-stickers)), so the scans can later be assigned automatically and anonymously.

## Create a new exam {#new-exam}

**New exam** (on the dashboard) asks only for the header data, creates the exam and opens it on the **Exam** step with the exercise library. Everything else (exercises, order, MC groups, layout, logo, packages, preview) is done there.

### Header data {#header}

**Subject**, **class**, **exam type**, **date** and **number** appear on the cover sheet. They are exam content and are therefore always printed in German, whatever language the interface is in.

The **title** is made from these details (for example "Kurzarbeit 1 · Informatik 10a · 05.11.2026") and follows them while you edit. It is shown in Examance only, not printed. Click the pen next to it to set your own title: it is then marked **custom title** and no longer changes with the details; ↺ makes it generated again.

The **printed class** (`\Klasse` on the cover sheet) is made from grade and class (10 and a give "10a") and shows as a small line under the **Class** field ("Printed: 10a"). Click it to print something else instead, for example "Q11 Inf"; it is then marked as your own entry, and ↺ goes back to grade and class.

**Save** and **Discard changes** appear only once you have changed something.

The optional **topic** (for example "Recursion") organises your exams in the overview, where you can filter and search by it. It is never printed. The overview can also be sorted by date, title, grade or subject.

To change the header data later, edit them directly in the **Details** card on the **Overview** and choose **Save** (**Discard changes** goes back; leaving the page with unsaved changes asks first). The card holds only the exam's details: title, test type, grade/class, date, duration, number, subject, teacher, topic and the retention date. Layout settings are on the [Layout tab](#layout), the grading key under [Results](./results#grading-key).

## The exam's steps {#steps}

Each exam has a sidebar (on a phone: the menu) with numbered steps. Every step has a badge showing where you stand (hover it for what it counts): the number of exercises, students or scans, graded x/y, the printed **Print** jobs, open MC checks, shared results (in red, the number of result e-mails that did not arrive). The number before a step's name is only its place in the flow. Steps 4A–6A (scans, MC check, digital grading) and B (paper grading) are alternatives: use B for a class graded on paper, without scans; you never need both. On the exams list, every step of an exam is shown in its card and opens that step. At the top right of every step page, next to the exam name and the step title, a **Next: …** button leads to the following step; explanations sit behind the ⓘ icons.

| Step | What you do there |
|---|---|
| **Overview** | Details and key figures of the exam, see [below](#overview) |
| 1 **Exam** | Exercises, layout and preview, see [Assemble the exercises](#assemble) and [Layout options](#layout) |
| 2 **Students** | The class list, see [Student data](./students#student-data) |
| 3 **Print** | Create the PDFs and the QR codes, see [Print](#print) |
| 4A **Scans** | Import the scanned sheets, see [Scanning and assignment](./scanning) |
| 5A **Check MC** | Verify multiple choice detections, see [Verify MC detections](./scanning#mc-verification) |
| 6A **Digital grading** | Correct the scanned submissions, see [Grading](./grading) |
| B **Paper grading** | Instead of 4A–6A: enter points for papers graded on paper, without scanning, see [Classes graded on paper](./grading#paper) |
| 7 **Results & Export** | Tabs **Statistics**, **Send to students** and **Archive**, see [Results and analysis](./results) |

## Overview {#overview}

**Overview** (the first entry of the sidebar, unnumbered) shows the exam's details, a few key figures (points, average, grading key) and, at the bottom, the **Workflow**: every step in order with its badge, each one a link; the step you most likely need next is highlighted. **Continue: …** (followed by the step's name) opens that step. The **Details** card edits the header data in place, **Back up / transfer** packs the exam as a readable ZIP or a password-protected backup that Examance can import again, for moving or sharing it (see [Export](#export)); to keep the results for your records, use **Results & Export → Archive** instead. The **⋯** menu (**More actions**) holds **Duplicate**, **Delete Submissions** and **Delete** (the exam).

## Assemble the exercises {#assemble}

On the **Exam** step, the **Exercises** tab lists the exam's exercises. **Add exercises** picks exercises from the library, with the variant you want for each. **New exercise** writes a new one right there; it is saved to your library and selected immediately.

- The arrows reorder the exercises.
- The total score is recalculated as you go.
- A long exercise simply continues on the next page; its heading always stays with its first lines.

![Picking exercises for an exam](../screenshots/pitch/04-exam-builder.jpg)

### Page breaks between exercises {#page-breaks}

To start an exercise on a new page, use **Insert page break** between two exercises. The break belongs to the exercise below it and moves with it when you reorder. Page breaks *inside* an exercise are set in the exercise itself, see [Page breaks](./exercises#page-breaks).

![Exercise list of an exam with an MC group, page breaks and extra solution space](../screenshots/guide/exam-exercises.jpg)

If you change page breaks after you created the answer-sheet template for MC detection, create the template again.

### MC groups {#mc-groups}

Several tick-box exercises can be printed together as an **MC group**. Create and edit groups on the **Exercises** tab (**MC Groups**). An exam can hold any number of groups of any size; each question belongs to at most one group.

In the exercise dialog, tick the questions on the **MC Groups** tab and give the group a title. **Apply Exercises and MC Group** adds the group together with the other exercises. To build several groups in one go, click **Add MC group to exam** after each one.

Groups are layout only: grading and statistics stay strictly per question.

## Layout options {#layout}

Layout settings live on the **Layout** tab of the **Exam** step: info text, name line, cut-off corner hint, the multiple choice correction legend, [printing on several sheets](#multi-sheet), logo and LaTeX packages. Every change is saved by itself; the card header shows **Saving…** and then **Saved**. Changes only show in the PDF after you compile again.

### Grading outside Examance {#digital-grading}

If you only create the exam with Examance and grade it on paper, switch off **Grade in Examance** at the top of the **Layout** tab. The exam then prints no corner markers, page codes, cut lines or sticker spots, and page 1 gets a name line. Everything else stays exactly where it is. With **Box for a results QR code** page 1 keeps one sticker box, for example to send results with DiRueLei. Scanning and personalised copies are greyed out for such an exam. Paper grading and the statistics stay available.

### Name line {#name-line}

With **Print a name line next to the QR code box** (when creating the exam or on the **Layout** tab), the title page gets a line for the student's name. The QR code box stays where it is, so scanning and assignment work as before; only the initials field inside the box is dropped.

### Cut-off corner {#cut-corner}

Every exam keeps each page's **outer top corner** free: top right on odd pages, top left on even ones. The header is mirrored on even pages. On the plain exam PDF the corner is empty and lightly tinted grey. When you print the QR codes [directly onto the exam copies](./students#printed-copies), page 1's corner carries name and personal key, and a dashed line with two small scissors shows where to cut it off before handing out; every other page shows the same line, so the whole stack is marked. For double-sided and booklet prints you can also cut the whole stack at once with a guillotine. All exams share this layout, so scanning always finds the corner markers in the same places, however the sheets were printed.

The text, and on page 1 the QR box and the information next to it, run out to the corner markers. Page 1's header shows the logo, then the title with course, date, duration and teacher in one line under it; the other pages show the title and "Seite X". The score table fills the strip between the bottom markers.

The sketch shows the usable space on odd and even pages: text area, header, score table, the cut-off tab with its tolerance, and the corner markers. The [PDF](../screenshots/guide/cut-corner-layout-en.pdf) is drawn at true scale on A4, so measurements on a 100 % print are real millimetres.

![Usable space with the cut-off corner: odd page (left) and even page (right)](../screenshots/guide/cut-corner-layout-en.png)

### How to correct a cross {#mc-hint}

**Show how to correct a cross at every multiple-choice task** (when creating the exam, or on the **Layout** tab) prints one short line at the start of every multiple choice task, in the exam and in the solution:

- **cross** a box to choose an option;
- **fill** the box completely to withdraw a cross;
- **cross just left of** a filled box to choose it again.

![The correction line printed under the MC group heading](../screenshots/guide/exam-mc-hint.jpg)

MC detection reads exactly these marks, see [Verify MC detections](./scanning#mc-verification). Turning the option on or off rebuilds the answer-sheet template, so typeset and print the exam again afterwards.

### Logo and LaTeX packages {#logo-packages}

Every exam prints a logo at the top left of the first page. On the **Layout** tab you choose the logo from your settings, no logo, or a logo for this exam only (see [Logo on the exam](./settings#logo)). In the exam overview, every expanded exam shows which logo it prints.

On the same tab you can also add LaTeX packages for this exam only or leave out packages of your account (see [LaTeX packages](./exercises#packages)).

## Several sheets {#multi-sheet}

An exam that runs over several sheets of paper is easier to handle when every page knows who and what it is. The **Layout** tab has an option for this, and the printed copies always fill whole sheets:

- **Page code on every page.** A small QR code (14 mm) at the top of every page, on the side of the cut-off corner, just inside the corner marker, tells the scanner which page it is. On [personalised copies](./students#printed-copies) it also carries the student's ID (the short sticker ID or the Mebis or Artemis ID, never the name). So the order of the scanned sheets no longer matters, missing pages are reported and loose sheets find their student. The code is reliable from 200 ppi scans; 300 ppi is better. It is on by default for new exams. Older exams keep their layout until you switch it on; that changes the page layout, so copies printed before no longer match.
- **Whole sheets.** Every printed copy is filled up to whole sheets (an even page count when printed double-sided, a multiple of 4 as a booklet), so each copy starts on a new sheet. The added pages are [extra pages](#extra-paper) for writing. Which multiple applies follows the print type you choose in the Print step, so the preview on the **Exam** step leaves these pages out; the Print step shows them. They are scanned, archived and exported like every other page.

How you print these sheets (double-sided or booklet, stickers per sheet) is chosen in the [Print step](#multi-sheet-print).

### Printing several sheets {#multi-sheet-print}

The print plan of the **Print** step holds these choices:

- **Personalised copies** or **Plain copies + stickers**.
- **How do you print?** **Double-sided (A4, two pages per sheet)** or **Booklet (folded A3, four pages per sheet)**.
- For booklets, **Who arranges the pages?** **Examance (A3 sheets, any printer)**: print on A3, double-sided, flip on the short edge, at actual size (100 %, with "fit to page", "scale to fit" and auto-centring turned off), fold along the printed centre line and staple. If your printer prints the sheets off-centre anyway, use **Shift (mm)** below it: print the **Test sheet** once, fold it edge to edge, read where the crease crosses the ruler (right of the centre is positive) and enter that value. It is saved with the exam, and Examance shifts every A3 sheet by it. Or **My printer's booklet function**: personalised copies then download as a ZIP with one PDF per student, which you print one by one.
- **Stickers per student** (only for plain copies + stickers). Double-sided: one for the whole exam (on the cover page) or one per sheet. Booklet: one for the whole exam, one per A3 sheet, or one per A4 leaf after cutting. Stickers on later sheets go onto a faint, unlabelled grey 35 × 35 mm spot at the top of the page, on the side away from the cut corner, over the page header. Personalised copies need no extra stickers: every page code names the student.

**Create print files** typesets what the plan prints (the solution only when **with solution** is ticked; unchanged parts are reused) and makes the sticker sheet or the personalised copies. Each job card then only has the download and the **printed** tick.

Before it makes personalised copies, the step warns about students without an ID (only their cover carries their code; their other pages are matched by order) and blocks the copies when two students share an ID. Fix both on the [Students page](./students#student-data).

**Booklet cut zone.** Every booklet page has a dashed cut line with six scissors over its height 6 mm from the fold, and a light grey strip between the line and the fold. Sheets Examance arranges also carry a thin solid line exactly on the fold, with heavier ticks at the top and bottom: cut and fold on it rather than measuring from the paper edge, which a printer may have shifted. Nobody writes there, and you can cut the booklet open along the fold anywhere inside this 12 mm band, so a slightly crooked cut does no harm. The text starts 8 mm from the fold. The cut-off corner is cut as before.

How to scan these sheets: [Scan the stack](./scanning#scan).

## Extra paper {#extra-paper}

Some students need more room than the task sheet offers. The **Layout** tab has a **Writing space** group for this:

- **Paper for writing**: **Squared** (5 mm, default for new exams), **Lined** (8 mm) or **Empty**. It applies to every writing space: the rest of the last page, the extra pages and the extra sheets. The pattern is light grey, so writing over it stays readable.
- **Heading** and **note** of the writing space (prefilled with "Platz für weitere Lösungen" and a short note, printed in German). They head the rest-of-page area and every extra page; the note stands on the heading's line.
- <a id="extra-space"></a>**Fill the rest of the last page**: the student sheet ends with a writing area between a **minimum** and a **maximum height** in cm. It fills the rest of the last page. When not even the minimum fits, it takes a whole new page instead. The solution sheet does not include it.
- **Extra pages (at least)** (0 to 20): whole pages for writing after the points table, for teachers who prefer a compact task sheet and free paper for the answers. This is a minimum: the printed copy gets more until it fills whole sheets (see [Several sheets](#multi-sheet)). They belong to every copy like any other page: page codes, sticker spots, personalised copies and scanning all treat them as exam pages.
**Extra sheets for stock.** The **Print** step always has an **Extra sheet (stock)** card. **Create print files** also makes one double-sided sheet in the exam's paper; print as many as you like and keep them for any exam. The sheet has no exam title. Its code at the top only says "extra sheet", and the student's QR sticker on the front says whose it is.

**Loose paper works too.** A student can also write on any sheet of paper, as long as it carries their QR sticker. In exams with page codes it is stored after that student's exam pages, and the scan reports it as an appended page.

**Stickers for extra paper.** The sticker sheet has no spare stickers for this. When a student takes extra paper, print that student a new sticker; a reprint always gives the same code.

**Scanning extra paper.** Scan extra sheets with the exam or later on their own. They always go after the student's exam pages, and pages scanned later are added to that student's existing scan, keeping its grading. The back of an extra sheet has no sticker spot, so it follows its front: scan both sides together.

## Typeset {#typeset}

**Live Preview PDF** typesets the exam and the solution sheet. On wide screens the preview sits next to the exercises and the layout; on smaller screens it is a third tab, **Preview**, beside **Exercises** and **Layout**. The run produces a print-ready PDF. Its cover page has an empty **QR Code** box for the student's QR sticker, see [QR stickers](./students#qr-stickers). Examance never compiles on its own: after you change the exam, the last preview stays visible, marked as outdated, until you press **Live Preview PDF** again.

Depending on your settings and your account, the exam is typeset

- **in your browser**: nothing leaves your device, but the first run downloads the LaTeX environment and is slower;
- **on the server**: faster on weak hardware; the LaTeX source is sent to the server.

See [LaTeX compilation](./settings#latex). If something looks wrong, [report a layout problem](./exercises#layout-reports); if compiling fails, see [When compiling fails](./exercises#compile-errors).

![Compiled exam and solution](../screenshots/pitch/04b-exam-setup.jpg)

### Preview from the overview {#preview}

In the exam overview, **Preview** in an expanded entry opens the last compiled PDF. If there is none, Examance asks, compiles the exam and shows it right in the window. The preview is kept only until the page is reloaded.

## Print {#print}

The **Print** step has the **print plan** on the left and the PDFs on the right (on smaller screens below it). The preview shows only what the plan prints, and only once it is up to date: for personalised copies without the solution, just the personalised copies. When Examance arranges a booklet, it shows the A3 sheets exactly as they will be printed. One button, **Create print files**, typesets what the plan prints, refreshes the scan template for MC detection and makes the sticker or copies PDF.

In the print plan you choose how you print: **Plain copies and a QR sticker sheet**, or **Personalised copies with the QR code printed on** (one copy per student with QR code, name and personal key, see [QR stickers](./students#qr-stickers) and [printed copies](./students#printed-copies)), and whether the **solution** is printed too. For several sheets the plan also holds [how you print](#multi-sheet-print). **Ready to print?** checks automatically whether the exam has exercises, the student list is filled, the PDFs match the current state and, with MC questions, the scan template is up to date.

Below it are exactly the print jobs of your plan (exam copies and sticker sheet, or the personalised copies; plus the solution). Every job works the same way: its header has the download, its options sit below (for stickers: how many per student, labels already used and **What to print?**, see [QR stickers](./students#qr-stickers)), and a **printed** tick closes it. A sticker sheet or set of personalised copies you create appears as a further pane next to task sheet and solution. Only you set the ticks, and only once the job's PDF exists for the current state: for the task sheet and solution the current preview, for stickers and personalised copies a PDF made here. A tick goes away only when what it was set for changes: content or layout for the exam and solution, the student list for the stickers, both for personalised copies. The step's badge in the sidebar shows how many jobs are ticked.

Print the sheets **exactly as typeset**: no "fit to page", no scaling, no cropping. The QR sticker and the corner marks must stay readable, otherwise the scan cannot be assigned automatically and ticked boxes cannot be detected.

### Remembered layouts {#pinned-layout}

As soon as you download the task sheet or the personalised copies, or tick them as **printed**, Examance remembers the answer sheet's layout: where its boxes, score fields and corner markers are. If you then change an exercise or the layout, or an update arrives, the sheets already printed are still read correctly: on import Examance first tries the most recently remembered layout and, if it does not fit, takes the remembered layout whose boxes lie on the scan. The list **Remembered answer-sheet layouts** under the print jobs shows each layout with its date; you can remove the layout of a version that was never handed out. If you changed the exam after printing, the **Exam** step points it out. Remembered layouts are stored encrypted on the server, so they also apply in another browser.

After the exam, continue with [Scanning and assignment](./scanning).

## Duplicate an exam {#duplicate}

**Duplicate** (in the exam list and in the **⋯** menu of the exam's **Overview**) creates a new exam with the same header, exercises, MC groups, grading key and settings, for example for a parallel class or the next school year. Students, scans and results are never copied; the copy starts without them.

## Export {#export}

**Back up / transfer** on an exam (the menu of its card on the dashboard, or the exam's **Overview**) downloads it either as a readable ZIP or as a password-protected backup, see [Exporting results](./results#export) and [Backup and transfer](./backup#exam-backup).

![Exporting an exam](../screenshots/guide/exam-export.jpg)
