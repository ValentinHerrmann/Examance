---
editLink: false
---

# QR stickers and results for students

Two things belong together here: **QR codes**, as stickers that students put on their exam sheet or printed directly onto it, so Examance knows whose paper it is, and **personal links** with which each student later downloads their graded exam. The students themselves, with their Mebis or Artemis ID and e-mail address, are kept in one place: the exam's **Students** page.

## Student data {#student-data}

**Students** (step 2 in the exam's sidebar) holds the exam's class list: names, the Mebis or Artemis ID and the e-mail address. Everything else only reads it: the QR stickers, the printed exam copies, and sharing results by e-mail, Artemis or Mebis.

- **Add student** adds a single student by hand; like imported ones, the student gets a QR code and a personal key.
- **Use a class list**: pick one of three ways at the top of the box. **File** reads a Mebis grading worksheet or participant list (CSV) or a plain list; **Paste** takes typed or pasted lines (`Lastname, Firstname; ID; address`, one per student); **Artemis course** fetches the course members. Examance shows what would change (new, updated, unchanged) and saves only after **Apply**. Students already in the list are recognised by their ID, otherwise by name, so importing the same list again only adds addresses. In the list, the pencil and bin icons edit or delete a single student; for several at once, tick them and use the buttons above the list.
- **Edit** a row to correct a name or an e-mail address. The same dialog edits several at once: tick their rows and choose **Edit** in the toolbar above the table (its buttons are greyed out until the selection fits, with the reason below); you edit name, student number, Mebis ID, Artemis ID and e-mail in one table. Examance lists possible side effects first (for example a renamed student whose exam is already scanned, a changed ID, a removed address, an ID used twice); you can still save with **Save anyway**.
- **Possible duplicates.** If a student is listed twice (for example stickers printed without an ID, the Mebis or Artemis list imported later, then scanned; or one entry from Mebis and one from Artemis), the page suggests the pairs. **Merge** keeps the entry with the scanned exam, so its QR code and key stay valid, and takes over the other entry's IDs and address. Wherever both entries have a value, you choose which one to keep. Before merging, Examance shows the resulting entry and whether the student is then reachable through Mebis, Artemis and e-mail; you merge only after ticking **I checked the result**. You can also tick exactly two rows and choose **Merge**. The merged-in entry goes to the trash.
- **Delete** says what goes with a student: if their exam is scanned, the scan and all grading are deleted too, and shared links stop working. You have to confirm this explicitly; everything goes to the trash and can be restored there.
- Students without an ID get a stable one derived from the name.
- **Order and numbers.** Every student has a number in the class list (the **#** column). It is printed before the name on the QR stickers, the key strips and slips and the corner of the printed exam copies (`07  Muster, Max`), so you can sort a stack of papers quickly. An imported list keeps the order of its file; students added later get the next free number, so stickers already printed stay valid. **Order** above the table renumbers the whole class by last name or by first name (for systems that list first names first); the arrows in a row move a single student up or down. Stickers printed before a renumbering keep their old numbers.

The list is stored **encrypted** with the exam, like the results (in hybrid mode only in this browser). When the scans come in, every page is matched to its student by the QR code; a student's address and name stay as entered. Deleting a scan keeps the student on the list.

## QR stickers {#qr-stickers}

The printed exam has an empty box labelled **QR Code** on its cover page. Each student sticks a QR name sticker into it. When you scan, Examance reads the sticker and assigns the pages to that student automatically, see [Scanning and assignment](./scanning#import).

The card **QR codes for students** on the exam's **Print** step prepares the stickers. With **Sticker sheet** it prints an A4 sheet of **5 × 7 labels**:

1. The stickers are made for the students on the [Students page](#student-data); add them there first. Printing again gives the same stickers.
2. Set the **number of stickers per student** and how many labels of the first sheet are **already used**, so a partly used sheet is not wasted.
3. Print the sheet at 100 % (no "fit to page") and cut or peel the labels.

For several sheets, the **Print** step ([Printing several sheets](./exams#multi-sheet-print)) lets you choose **Stickers per student**: one for the whole exam (cover page) or one per sheet; for booklets one for the whole exam, one per A3 sheet or one per A4 leaf after cutting. Stickers on later sheets go onto a faint, unlabelled grey 35 × 35 mm spot at the top of the page, on the side away from the cut corner, over the page header. The sticker sheet suggests one sticker per spot plus the cover.

Stickers made by other tools in the format `Lastname, Firstname_ID` work as well. Students you added by hand or from unmatched pages have no sticker.

Everything is computed in your browser; no external service draws the codes.

## QR codes printed on the exam copies {#printed-copies}

Instead of stickers, Examance can print each student's QR code **directly onto their own copy** of the exam. With **Print directly onto the exam copies** on the same card you get one PDF with a copy per student, in list order:

- The QR code sits in the QR box on the cover page, exactly where a sticker would go, so scanning works as with stickers. Spare copies printed from the plain exam PDF keep the box's label and initials field, so a student who needs a new sheet gets a sticker instead.
- The **top-right corner of page 1** carries the student's **name and personal key** on the far side of a dashed diagonal line with small scissors. **Before handing out, cut the corner off** along the line. You may cut the whole stack at once with a guillotine. The student recognises their copy by it and keeps it; the key later opens their [shared result](#share-results).
- There is blank room around the line, so an imprecise cut touches neither the name nor the exam.
- Cut the corners off **before scanning**. Examance stores every page exactly as scanned and never covers anything, so a corner that was not cut off shows the name during grading and in exports.

**Print directly onto the exam copies** is greyed out for exams imported without their exercise texts.

Every exam keeps this corner free on each page ([layout](./exams#cut-corner)): top right on odd pages, top left on even pages, which is the corner a cut through a double-sided or booklet stack removes. On the plain exam PDF it stays empty and lightly grey.

**Printing and cutting:** print the copies **double-sided, flipping on the long edge**, or as a booklet. Every page shows the dashed cut line at its outer corner, so you can cut the whole stack at once with a guillotine along the line on the top sheet. In exams without page codes, a copy with an odd number of pages gets a blank page, so every copy starts on a new sheet. With [page codes](./exams#multi-sheet), every copy is filled up to whole sheets (or folded A3 sheets for booklets) with filler pages that are part of the exam and are scanned like every other page. Every page code carries the student's ID (never the name), so personalised copies need no extra stickers. For booklets, the **Print** step also lets you choose [who arranges the pages](./exams#multi-sheet-print). Print at actual size, without "fit to page".

Before it makes personalised copies, the **Print** step warns about students without an ID: only their cover carries their code, their other pages are matched by order. It blocks the copies when two students share an ID; fix that on the Students page ([possible duplicates](#student-data)).

## Personal keys {#personal-keys}

Under **What to print?** you choose one of three options. With **Stickers with personal key** (the default), each student's first sticker carries a **strip with their name and key** above the QR code, separated by a dashed line. No extra label is used. **Cut the strip off and hand it to the student before the sticker goes onto the exam**; the student keeps it. The QR code below still identifies the student without the strip. The key belongs to that sticker and is the same on every reprint, so nothing needs to be stored.

A personal key is only needed if you later protect result links with it, see [Link protection](#link-protection). **Stickers only** prints the QR codes without keys. If students already carry a sticker (from an earlier sheet or another tool), choose **Key slips only (plain paper)**: the keys of the exam's students are printed as small slips on **plain paper**, so no labels are used.

## Share graded exams with students {#share-results}

After grading, **Results & Export → Send to students** gives each student their graded PDF, with your annotations and score, and their name printed in red at the top of every page. It is a page with four numbered steps and a send button that stays visible at the bottom:

1. **Choose students.** Students with a grading are preselected.
2. **Choose the way**:
   - **Slips to hand out**: a PDF with one slip per student, showing a QR code and the link.
   - **By e-mail**, see [Send by e-mail](#email).
   - **Through Artemis**, see [Mebis and Artemis](#artemis).
   - **Feedback files for Mebis (download)**: a ZIP with each student's graded PDF to upload in the Mebis assignment, see [Mebis and Artemis](#lms).

   A way that is not available is greyed out, with the reason below it: your administrator has not enabled sending for your account, or no mail server is set up for e-mail.
   The channel's setup (for example the Artemis course) and the **Language of the message** are part of this step.
3. **Protection and options**: the link protection, see [below](#link-protection), and the validity of 7, 14, 30 or 90 days (30 by default). Optionally tick **Include the sample solution**: students then see the exam's sample solution on the same page. It is compiled once for all students. Exams imported without their exercise code cannot include it. **Print keys** from this step opens on top of the page and keeps all your choices.
4. **Preview and send**: check the preview, then send. For slips, **Share and create slips** prepares the graded PDFs in your browser, uploads them encrypted and downloads the slip PDF. Print it and cut the slips apart.

Sharing a student **again** creates a new link; the old one stops working. This is how you replace a lost slip or a corrected grading.

::: tip Hybrid mode
If your results are kept only in this browser, sharing is the one exception: the graded PDFs are uploaded to the server, **encrypted**, so that students can fetch them. The page tells you so. Only people who hold the link can open them.
:::

## Link protection {#link-protection}

The link itself already protects the PDF: without it, nobody can even fetch it. You can add a second factor, in case a link is forwarded or a slip is seen by others.

| Protection | The student needs |
|---|---|
| **Link only** | the link or the QR code on the slip |
| **Link plus the key from the QR sticker** | the link and the personal key from their sticker sheet, see [Personal keys](#personal-keys) |
| **Link plus a code on a separate slip** | the link and an eight-character code (such as `ABCD-EFGH`) on a slip you hand out separately |

The code on the separate slip **is the student's personal key**, the same one printed with their QR sticker or on their exam copy. The code slips therefore also replace a lost key. Only students without a sticker get a newly created code.

Options that do not fit your selection are greyed out and the page says why. For example, students without a QR sticker cannot use the sticker key; **Print keys** helps there; it opens on top and keeps all your choices.

**Key in the message.** For e-mail and Artemis you can tick **Put the key or code into the message**. The link then opens without slip or sticker, which helps students who lost their key. It is less safe: whoever can read the message (the mail provider, Artemis, anyone with access to the mailbox) can open the exam. It is off by default.

**Language.** E-mails and Artemis messages to students are written in German unless you choose English in **Language of the message** (step 2).

## Send by e-mail {#email}

Each student gets an e-mail with their link. For that, the students of the exam need an e-mail address:

- Add them on the [Students page](#student-data): from a Mebis list, an Artemis course or a pasted list, or per student with **Edit**. Under **By e-mail** the share page shows how many students have an address and links there.
- The share page's student list shows each student's Mebis/Artemis ID and e-mail address; an empty cell means none is known.

Because the mail goes through the Examance server, a link sent by e-mail must never open the exam on its own: only **key from the QR sticker** and **code on a separate slip** are offered (unless you put the key into the message yourself, see [Link protection](#link-protection)). With codes, the code slips are downloaded at the end; hand them out in class.

## Mebis and Artemis {#lms}

Examance works with Mebis and Artemis in the same way as DiRueLei.

**Mebis** has no connection; you exchange files:

1. In the Mebis assignment, download the **grading worksheet** (or export the participant list as CSV). It contains the students' Mebis IDs and e-mail addresses.
2. Import this file on the [Students page](#student-data) and print the [QR stickers](#qr-stickers) or copies: the Mebis ID goes into each code.
3. After grading, choose **Feedback files for Mebis (download)** on **Results & Export → Send to students**. You get a `…_mebis_feedback.zip`. Upload it in the Mebis assignment under **Upload multiple feedback files in a zip**. Each student then sees their graded exam as feedback.

Students with no Mebis ID (neither from the class list nor in their QR sticker) are skipped and listed in the notes after the download.

### Artemis {#artemis}

**Artemis** is connected through the Examance server, which forwards only to approved Artemis addresses (for example `artemis.tum.de`):

- **Course ID**: the number in the course address (`…/courses/123`).
- **Artemis token**: the value of the `jwt` cookie of your signed-in Artemis (browser developer tools → storage → cookies). It is used only for this run and stored nowhere.

With it you can **load the course members on the [Students page](#student-data)** (each QR code then carries the Artemis user ID) and later **send results through Artemis**: every student gets a direct message from you, either

- with the **link** (protected by sticker key or code, as with e-mail; the exam stays encrypted, expires and can be revoked), or
- with the **graded exam as a PDF**: then the PDF goes unencrypted to Artemis and stays stored there; expiry and revoking do not apply, so the page hides the **Valid for** option.

### Preview before sending {#delivery-preview}

Before anything is sent by e-mail or Artemis, a **preview** lists every student with the recipient (address or Artemis user) and what they get, names the students who are skipped and why, and states which data is used, where it goes and where it is stored. Nothing is sent until you confirm. While sending, the page shows how far it is (for example "20 of 25 e-mails sent") with a filling bar; keep the tab open until it has finished.

## Did it arrive? {#delivery-status}

After sending by e-mail or Artemis, the share page shows a **Delivery** column per student:

| Status | Meaning |
|---|---|
| **Sent** | The mail server or Artemis accepted the message. Nothing came back, which is no proof that the student read it. |
| **Delayed** | The receiving mail server is still trying. |
| **Not delivered** | The e-mail came back, for example because the address does not exist or the mailbox is full. Hover the badge for the mail server's code. |
| **Failed** | The message could not be sent at all; the page listed the reason when you sent it. |
| **Link revoked** | The message was sent, but the link in it no longer works: you revoked it or it has expired. Send again to give the student a new link. |

If your installation has its own mailbox for result mails, they are sent from it, and they ask students not to reply but to contact you another way: replies do not reach you.

After an e-mail run the page waits about 30 seconds and checks for returned mails. You can leave earlier: e-mails that come back later are forwarded to your own address, and the **Share** badge of the exam's **Results** step then shows in red how many students were not reached. To send again, correct the address or Artemis id on the [Students page](#student-data), open **Results & Export → Send to students**, choose **Select students not reached** and send.

If the page says that returned e-mails are not monitored, your installation has no result mailbox: then "Sent" only means that the mail server accepted the message.

## What students see {#student-view}

Students scan the QR code or type the link (an address beginning with `/result#`). A page opens that asks for the key or code if the protection needs one. After that, the graded exam, and the sample solution if you included it, is shown **in the browser, view only**: there is no download button. This stops casual downloading, not a determined student, who can still take screenshots. A wrong key is simply reported as incorrect.

No sign-in and no account are needed. The PDF is decrypted only in the student's browser.

## Grading review / objections {#grading-review}

Students can object to the grading of single exercises through their result link, and you answer them in the app.

- **Switch it on.** In step 3 of **Send to students**, tick **Allow objections until** and pick a deadline (14 days are preset; never later than the link's validity). It is off by default.
- **What students see.** Under the graded exam one field per exercise and sub-exercise (500 characters each). They can edit or withdraw an objection until you open it or the deadline passes; after that it is locked.
- **Notification.** You get an e-mail per objection with the exam title and a link, never the student's name or text, and a badge on **Results** in the exam's sidebar. You can switch the e-mail off in **Settings**.
- **Answer.** Open the submission on the grading page: under each exercise's score row the objection appears. Opening it locks it for the student. Change the points if needed, write your reply and press **Send reply**. This saves the scores, updates the graded exam under the **same link** and shows the student your reply and the new points ("Grading updated on ..."). If the student has an e-mail address, they get a short notice by e-mail (optional in the dialog).
- **Other changes.** Score changes without a reply are not published by themselves: use **Update shared result** in the row of the Send to students page.
- **Older links.** Links created before this feature cannot carry objections or be updated; share the result again (the old link then stops working).
- **Sharing again or revoking.** An objection you have not answered yet is not lost: before a new link replaces the old one (or you revoke it), the objection is saved in the grading, and the dialog names the students concerned. On the grading page it is marked "from a replaced link" and you can still answer it; the reply is saved and put into the student's current link. If an objection cannot be read, that link is left unchanged and a warning says so.
- **Keep the thread.** The thread is saved with the exam's results (where your results live, following your storage mode). Wherever you download graded PDFs (the export dialog, the Archive tab's ZIP list and combined print PDF, the download of a single paper on the Scan page), a **Print grading review** choice appears as soon as there is an objection; otherwise a short line says there is none. Tick any combination: **Short note** (a small red line "review: 3 -> 4 P." under the score box; preselected), **Side strip** or **Bottom strip** (a margin strip with objection, reply and points; the scan is not covered; only one of the two), **Summary page** (one page at the end) and **Attach the full text** (the complete thread as a text file inside the PDF, so a shortened text is never lost). Your choice is remembered in this browser. The combined print PDF cannot carry an attachment (it is greyed out there; the ZIP has it). The copy students see on their link uses the same choices, remembered separately, without the attachment because students view the PDF only.

## Revoke links and expiry {#revoke}

**Results & Export → Send to students** lists the **active links**. You can **revoke** one link (the icon in its row), or use **Revoke all**; revoked links stop working immediately and their data is deleted.

Links also end by themselves:

- when their validity (7 to 90 days) is over: expired links are deleted;
- when you delete the exam or the student;
- they are never restored with an exam from the [trash](./trash).

## Privacy {#privacy}

- The PDF is **encrypted in your browser** before it is uploaded. The key is in the link, and a link's `#` part is never sent to the server. The server stores only ciphertext and cannot read any result, not even names.
- With a second factor, a forwarded link alone does not open the PDF.
- Students do not sign in; the server learns only that a link was opened. It limits attempts per address and answers every unknown, expired or revoked link in the same way.
- Objections and your replies are encrypted in the same way; the server stores only ciphertext and cannot read them.
- Treat a slip like the graded paper itself: hand it to the student personally.
- **E-mail and Artemis**: the address or Artemis ID, the link and the Artemis token pass through the Examance server only to deliver; they are not stored or logged there. Only the PDF option for Artemis sends a readable result, and the preview says so.

More on the technical side is in the [security description](../data_flow_and_security).
