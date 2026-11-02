---
editLink: false
---

# QR stickers and results for students

Two things belong together here: **QR stickers** that students put on their exam sheet so Examance knows whose paper it is, and **personal links** with which each student later downloads their graded exam. Both buttons are on the exam page.

## QR stickers {#qr-stickers}

The printed exam has an empty box labelled **QR Code** on its cover page. Each student sticks a QR name sticker into it. When you scan, Examance reads the sticker and assigns the pages to that student automatically, see [Scanning and assignment](./scanning#import).

**QR stickers** on the exam page opens a dialog that prints an A4 sheet of **5 × 7 labels**:

1. Choose where the names come from: **paste a list** (one line per student, `Lastname, Firstname`, optionally followed by a tab or `;` and an ID, for example a school number), or take the **students of the exam**.
2. Without an ID, Examance derives a stable one from the name. Printing the same list again therefore gives the same stickers.
3. Set the **number of stickers per student** and how many labels of the first sheet are **already used**, so a partly used sheet is not wasted.
4. Print the sheet at 100 % (no "fit to page") and cut or peel the labels.

**From Mebis or Artemis.** Below the list, **Choose file** reads a Mebis export, or **Load from an Artemis course** fetches the course members; both fill the list, so you can check it before printing. See [Mebis and Artemis](#lms).

Stickers made by other tools in the format `Lastname, Firstname_ID` work as well. Students you added by hand or from unmatched pages have no sticker.

Everything is computed in your browser; no external service draws the codes.

## Personal keys {#personal-keys}

With **Also print a personal key**, each student's first sticker carries a **strip with their name and key** above the QR code, separated by a dashed line. No extra label is used. **Cut the strip off and hand it to the student before the sticker goes onto the exam**; the student keeps it. The QR code below still identifies the student without the strip. The key belongs to that sticker and is the same on every reprint, so nothing needs to be stored.

A personal key is only needed if you later protect result links with it, see [Link protection](#link-protection). If students already carry a sticker (from an earlier sheet or another tool), choose **Print only the key slips**: the keys of the exam's students are printed as small slips on **plain paper**, so no labels are used.

## Share graded exams with students {#share-results}

After grading, **Share with students** on the exam page gives each student their graded PDF, with your annotations and score, and their name printed in red at the top of every page.

1. **Choose students.** Students with a grading are preselected.
2. **Choose the way**:
   - **Slips to hand out**: a PDF with one slip per student, showing a QR code and the link.
   - **By e-mail**, see [Send by e-mail](#email).
   - **Through Artemis**, see [Mebis and Artemis](#artemis).

   E-mail and Artemis are missing only if your administrator turned them off for your account.
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

## Send by e-mail {#email}

Each student gets an e-mail with their link. For that, the students of the exam need an e-mail address:

- In the sharing dialog under **By e-mail**, **Choose file** reads a Mebis export or a list (`Lastname, Firstname; ID; address`, one line per student). Examance matches the addresses to the students by the ID on their QR sticker, otherwise by name, shows the result, and saves them with **Use … addresses**.
- Or enter an address per student in the roster (**Edit**).

The address is stored **encrypted** with the student, like their name.

Because the mail goes through the Examance server, a link sent by e-mail must never open the exam on its own: only **key from the QR sticker** and **code on a separate slip** are offered. With codes, the code slips are downloaded at the end; hand them out in class.

## Mebis and Artemis {#lms}

Examance works with Mebis and Artemis in the same way as DiRueLei.

**Mebis** has no connection; you exchange files:

1. In the Mebis assignment, download the **grading worksheet** (or export the participant list as CSV). It contains the students' Mebis IDs and e-mail addresses.
2. Print the [QR stickers](#qr-stickers) from this file: the Mebis ID goes into each sticker.
3. After grading, tick **Mebis feedback files (ZIP)** in the [export](./results#export). The download contains a separate `…_mebis_feedback.zip`. Upload it in the Mebis assignment under **Upload multiple feedback files in a zip**. Each student then sees their graded exam as feedback.

Students whose sticker carries no Mebis ID are listed in the export warnings.

### Artemis {#artemis}

**Artemis** is connected through the Examance server, which forwards only to approved Artemis addresses (for example `artemis.tum.de`):

- **Course ID**: the number in the course address (`…/courses/123`).
- **Artemis token**: the value of the `jwt` cookie of your signed-in Artemis (browser developer tools → storage → cookies). It is used only for this run and stored nowhere.

With it you can **load the course members for the QR stickers** (each sticker then carries the Artemis user ID) and later **send results through Artemis**: every student gets a direct message from you, either

- with the **link** (protected by sticker key or code, as with e-mail; the exam stays encrypted, expires and can be revoked), or
- with the **graded exam as a PDF**: then the PDF goes unencrypted to Artemis and stays stored there; expiry and revoking do not apply.

### Preview before sending {#delivery-preview}

Before anything is sent by e-mail or Artemis, a **preview** lists every student with the recipient (address or Artemis user) and what they get, names the students who are skipped and why, and states which data is used, where it goes and where it is stored. Nothing is sent until you confirm.

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
- **E-mail and Artemis**: the address or Artemis ID, the link and the Artemis token pass through the Examance server only to deliver; they are not stored or logged there. Only the PDF option for Artemis sends a readable result, and the preview says so.

More on the technical side is in the [security description](../data_flow_and_security).
