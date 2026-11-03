---
editLink: false
---

# QR stickers and results for students

Two things belong together here: **QR codes**, as stickers that students put on their exam sheet or printed directly onto it, so Examance knows whose paper it is, and **personal links** with which each student later downloads their graded exam. The students themselves, with their Mebis or Artemis ID and e-mail address, are kept in one place: the exam's **Students** page.

## Student data {#student-data}

**Students** (in the exam's sidebar, or the button on the exam page) holds the exam's class list: names, the Mebis or Artemis ID and the e-mail address. Everything else only reads it: the QR stickers, the printed exam copies, and sharing results by e-mail, Artemis or Mebis.

- **Use a class list**: **Choose file** reads a Mebis grading worksheet or participant list (CSV) or a plain list; **Or paste a list** takes typed or pasted lines (`Lastname, Firstname; ID; address`, one per student); **Load from an Artemis course** fetches the course members. Examance shows what would change (new, updated, unchanged) and saves only after **Apply**. Students already in the list are recognised by their ID, otherwise by name, so importing the same list again only adds addresses.
- **Edit** a row to correct a name or an e-mail address. The same dialog edits several at once: tick their rows and choose **Edit** in the toolbar above the table (its buttons are greyed out until the selection fits, with the reason below); you edit name, student number, Mebis ID, Artemis ID and e-mail in one table. Examance lists possible side effects first (for example a renamed student whose exam is already scanned, a changed ID, a removed address, an ID used twice); you can still save with **Save anyway**.
- **Possible duplicates.** If a student is listed twice (for example stickers printed without an ID, the Mebis or Artemis list imported later, then scanned; or one entry from Mebis and one from Artemis), the page suggests the pairs. **Merge** keeps the entry with the scanned exam, so its QR code and key stay valid, and takes over the other entry's IDs and address. Wherever both entries have a value, you choose which one to keep. Before merging, Examance shows the resulting entry and whether the student is then reachable through Mebis, Artemis and e-mail; you merge only after ticking **I checked the result**. You can also tick exactly two rows and choose **Merge**. The merged-in entry goes to the trash.
- **Delete** says what goes with a student: if their exam is scanned, the scan and all grading are deleted too, and shared links stop working. You have to confirm this explicitly; everything goes to the trash and can be restored there.
- Students without an ID get a stable one derived from the name.

The list is stored **encrypted** with the exam, like the results (in hybrid mode only in this browser). When the scans come in, every page is matched to its student by the QR code; a student's address and name stay as entered. Deleting a scan keeps the student on the list.

## QR stickers {#qr-stickers}

The printed exam has an empty box labelled **QR Code** on its cover page. Each student sticks a QR name sticker into it. When you scan, Examance reads the sticker and assigns the pages to that student automatically, see [Scanning and assignment](./scanning#import).

**Print QR codes** on the exam page opens a dialog. With **Sticker sheet** it prints an A4 sheet of **5 × 7 labels**:

1. The stickers are made for the students on the [Students page](#student-data); add them there first. Printing again gives the same stickers.
2. Set the **number of stickers per student** and how many labels of the first sheet are **already used**, so a partly used sheet is not wasted.
3. Print the sheet at 100 % (no "fit to page") and cut or peel the labels.

Stickers made by other tools in the format `Lastname, Firstname_ID` work as well. Students you added by hand or from unmatched pages have no sticker.

Everything is computed in your browser; no external service draws the codes.

## QR codes printed on the exam copies {#printed-copies}

Instead of stickers, Examance can print each student's QR code **directly onto their own copy** of the exam. With **Print directly onto the exam copies** in the same dialog you get one PDF with a copy per student, in list order:

- The QR code sits in the QR box on the cover page, exactly where a sticker would go, so scanning works as with stickers. Spare copies printed from the plain exam PDF keep the box's label and initials field, so a student who needs a new sheet gets a sticker instead.
- The **top-right corner of page 1** carries the student's **name and personal key** on the far side of a dashed diagonal line with small scissors. **Before handing out, cut the corner off** along the line. You may cut the whole stack at once with a guillotine. The student recognises their copy by it and keeps it; the key later opens their [shared result](#share-results).
- There is blank room around the line, so an imprecise cut touches neither the name nor the exam.
- Cut the corners off **before scanning**. Examance stores every page exactly as scanned and never covers anything, so a corner that was not cut off shows the name during grading and in exports.

Every exam keeps this corner free on each page ([layout](./exams#cut-corner)): top right on odd pages, top left on even pages, which is the corner a cut through a double-sided or booklet stack removes. On the plain exam PDF it stays empty and lightly grey.

**Printing and cutting:** print the copies **double-sided, flipping on the long edge**, or as a booklet. Every page shows the dashed cut line at its outer corner, so you can cut the whole stack at once with a guillotine along the line on the top sheet. A copy with an odd number of pages gets a blank page, so every copy starts on a new sheet. Print at actual size, without "fit to page".

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
   - **Feedback files for Mebis (download)**: a ZIP with each student's graded PDF to upload in the Mebis assignment, see [Mebis and Artemis](#lms).

   A way that is not available is greyed out, with the reason below it: your administrator has not enabled sending for your account, or no mail server is set up for e-mail.
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
| **Link plus a code on a separate slip** | the link and an eight-character code (such as `ABCD-EFGH`) on a slip you hand out separately |

The code on the separate slip **is the student's personal key**, the same one printed with their QR sticker or on their exam copy. The code slips therefore also replace a lost key. Only students without a sticker get a newly created code.

Options that do not fit your selection are greyed out and the dialog says why. For example, students without a QR sticker cannot use the sticker key; **Print keys** helps there.

**Key in the message.** For e-mail and Artemis you can tick **Put the key or code into the message**. The link then opens without slip or sticker, which helps students who lost their key. It is less safe: whoever can read the message (the mail provider, Artemis, anyone with access to the mailbox) can open the exam. It is off by default.

**Language.** E-mails and Artemis messages to students are written in German unless you choose English in **Language of the message**.

## Send by e-mail {#email}

Each student gets an e-mail with their link. For that, the students of the exam need an e-mail address:

- Add them on the [Students page](#student-data): from a Mebis list, an Artemis course or a pasted list, or per student with **Edit**. Under **By e-mail** the sharing dialog shows how many students have an address and links there.
- The sharing dialog's student list shows each student's Mebis/Artemis ID and e-mail address; an empty cell means none is known.

Because the mail goes through the Examance server, a link sent by e-mail must never open the exam on its own: only **key from the QR sticker** and **code on a separate slip** are offered (unless you put the key into the message yourself, see [Link protection](#link-protection)). With codes, the code slips are downloaded at the end; hand them out in class.

## Mebis and Artemis {#lms}

Examance works with Mebis and Artemis in the same way as DiRueLei.

**Mebis** has no connection; you exchange files:

1. In the Mebis assignment, download the **grading worksheet** (or export the participant list as CSV). It contains the students' Mebis IDs and e-mail addresses.
2. Import this file on the [Students page](#student-data) and print the [QR stickers](#qr-stickers) or copies: the Mebis ID goes into each code.
3. After grading, choose **Feedback files for Mebis (download)** in **Share with students**, or tick **Mebis feedback files (ZIP)** in the [export](./results#export). Either way you get a `…_mebis_feedback.zip`. Upload it in the Mebis assignment under **Upload multiple feedback files in a zip**. Each student then sees their graded exam as feedback.

Students whose sticker carries no Mebis ID are listed in the export warnings.

### Artemis {#artemis}

**Artemis** is connected through the Examance server, which forwards only to approved Artemis addresses (for example `artemis.tum.de`):

- **Course ID**: the number in the course address (`…/courses/123`).
- **Artemis token**: the value of the `jwt` cookie of your signed-in Artemis (browser developer tools → storage → cookies). It is used only for this run and stored nowhere.

With it you can **load the course members on the [Students page](#student-data)** (each QR code then carries the Artemis user ID) and later **send results through Artemis**: every student gets a direct message from you, either

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
