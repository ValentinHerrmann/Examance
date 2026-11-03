---
editLink: false
---

# QR stickers and results for students

Two things belong together here: **QR codes**, as stickers that students put on their exam sheet or printed directly onto it, so Examance knows whose paper it is, and **personal links** with which each student later downloads their graded exam. Both buttons are on the exam page.

## QR stickers {#qr-stickers}

The printed exam has an empty box labelled **QR Code** on its cover page. Each student sticks a QR name sticker into it. When you scan, Examance reads the sticker and assigns the pages to that student automatically, see [Scanning and assignment](./scanning#import).

**Print QR codes** on the exam page opens a dialog. With **Sticker sheet** it prints an A4 sheet of **5 × 7 labels**:

1. Choose where the names come from: **paste a list** (one line per student, `Lastname, Firstname`, optionally followed by a tab or `;` and an ID, for example a school number), or take the **students of the exam**.
2. Without an ID, Examance derives a stable one from the name. Printing the same list again therefore gives the same stickers.
3. Set the **number of stickers per student** and how many labels of the first sheet are **already used**, so a partly used sheet is not wasted.
4. Print the sheet at 100 % (no "fit to page") and cut or peel the labels.

Stickers made by other tools in the format `Lastname, Firstname_ID` work as well. Students you added by hand or from unmatched pages have no sticker.

Everything is computed in your browser; no external service draws the codes.

## QR codes printed on the exam copies {#printed-copies}

Instead of stickers, Examance can print each student's QR code **directly onto their own copy** of the exam. With **Print directly onto the exam copies** in the same dialog you get one PDF with a copy per student, in list order:

- The QR code sits in the QR box on the cover page, exactly where a sticker would go, so scanning works as with stickers. Spare copies printed from the plain exam PDF keep the box's label and initials field, so a student who needs a new sheet gets a sticker instead.
- The **top-right corner of page 1** carries the student's **name and personal key** on the far side of a dashed diagonal line. **Before handing out, cut the corner off** along the line. You may cut the whole stack at once with a guillotine. The student recognises their copy by it and keeps it; the key later opens their [shared result](#share-results).
- There is blank room around the line, so an imprecise cut touches neither the name nor the exam.
- If a corner was not cut off, Examance **covers it when the scans come in**, so the name never shows during grading or in exports.

This needs the corner: turn on **Cut-off corner for printed QR codes** in the exam details (when creating the exam or under **Edit Exam**). Then every page keeps its **outer top corner** free: top right on odd pages, top left on even pages, which is the corner a cut through a double-sided or booklet stack removes. The header is mirrored on even pages and uses the other corner as usual. The text of every page starts about 8 mm lower but runs 1 cm wider, out to the corner markers.

**Printing and cutting:** print the copies **double-sided, flipping on the long edge**, or as a booklet. Every page shows the dashed cut line at its outer corner, so you can cut the whole stack at once with a guillotine along the line on the top sheet. A copy with an odd number of pages gets a blank page, so every copy starts on a new sheet. Print at actual size, without "fit to page".

## Personal keys {#personal-keys}

With **Also print a personal key**, each student's first sticker carries a **strip with their name and key** above the QR code, separated by a dashed line. No extra label is used. **Cut the strip off and hand it to the student before the sticker goes onto the exam**; the student keeps it. The QR code below still identifies the student without the strip. The key belongs to that sticker and is the same on every reprint, so nothing needs to be stored.

A personal key is only needed if you later protect result links with it, see [Link protection](#link-protection). If students already carry a sticker (from an earlier sheet or another tool), choose **Print only the key slips**: the keys of the exam's students are printed as small slips on **plain paper**, so no labels are used.

## Share graded exams with students {#share-results}

After grading, **Share with students** on the exam page gives each student their graded PDF, with your annotations and score, and their name printed in red at the top of every page.

1. **Choose students.** Students with a grading are preselected.
2. **Choose the way.** Today this is **Slips to hand out**: a PDF with one slip per student, showing a QR code and the link.
3. **Choose the link protection**, see [below](#link-protection).
4. **Choose the validity**: 7, 14, 30 or 90 days (30 by default).
5. Optionally tick **Include the sample solution**: students then see the exam's sample solution on the same page. It is compiled once for all students. Exams imported without their exercise code cannot include it.
6. **Share and create slips** prepares the graded PDFs in your browser, uploads them encrypted and downloads the slip PDF. Print it and cut the slips apart.

Sharing a student **again** creates a new link; the old one stops working. This is how you replace a lost slip or a corrected grading.

::: tip Hybrid mode
If your results are kept only in this browser, sharing is the one exception: the graded PDFs are uploaded to the server, **encrypted**, so that students can fetch them. The dialog tells you so. Only people who hold the link can open them.
:::

## Link protection {#link-protection}

The link itself already protects the PDF: without it, nobody can even fetch it. You can add a second factor, in case a link is forwarded or a slip is seen by others.

| Protection | The student needs |
|---|---|
| **Link only** | the link or the QR code on the slip |
| **Link plus the key from the QR sticker** | the link and the personal key from their sticker sheet, see [Personal keys](#personal-keys) |
| **Link plus a code on a separate slip** | the link and an eight-character code (such as `ABCD-EFGH`) that you hand out separately |

Options that do not fit your selection are greyed out and the dialog says why. For example, students without a QR sticker cannot use the sticker key; **Print keys** helps there. A code is created fresh for every student and never stored: if one is lost, share that student again.

## What students see {#student-view}

Students scan the QR code or type the link (an address beginning with `/result#`). A page opens that asks for the key or code if the protection needs one. After that, the graded exam, and the sample solution if you included it, is shown **in the browser, view only**: there is no download button. This stops casual downloading, not a determined student, who can still take screenshots. A wrong key is simply reported as incorrect.

No sign-in and no account are needed. The PDF is decrypted only in the student's browser.

## Revoke links and expiry {#revoke}

The sharing dialog lists the **active links**. You can **revoke** one link, or **all of them** at once; revoked links stop working immediately and their data is deleted.

Links also end by themselves:

- when their validity (7 to 90 days) is over: expired links are deleted;
- when you delete the exam or the student;
- they are never restored with an exam from the [trash](./trash).

## Privacy {#privacy}

- The PDF is **encrypted in your browser** before it is uploaded. The key is in the link, and a link's `#` part is never sent to the server. The server stores only ciphertext and cannot read any result, not even names.
- With a second factor, a forwarded link alone does not open the PDF.
- Students do not sign in; the server learns only that a link was opened. It limits attempts per address and answers every unknown, expired or revoked link in the same way.
- Treat a slip like the graded paper itself: hand it to the student personally.

More on the technical side is in the [security description](../data_flow_and_security).
