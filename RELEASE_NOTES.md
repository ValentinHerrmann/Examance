## What's new in 0.5.0

* **New address: examance.de.** Sign in there once with your old passkey, then create a new one. If your results are stored only in your browser, the old address helps you take them along first. The server address is now set by your administrator, so you no longer enter it yourself. (#204)
* **Trash:** anything you delete can be restored with one click for 7 days, or deleted for good right away. Admins can recover older items from the nightly backup. (#201)
* **Scores fill in on the scanned exam:** points appear next to each exercise and part, and the total and grade in the table at the end. Parts (a, b, …) can be graded one by one. Scans from more scanners now import correctly. (#191)
* **Simpler "New exam":** enter the exam details first, then add exercises in the editor. Ticked multiple-choice questions are added as a group automatically. (#173, #203)
* **One export dialog**, including a password-protected backup that can leave out the exercise texts. **One score table** for grading by student or by exercise. (#173)
* **PDF preview only on request:** exams are compiled when you click "Live Preview PDF". After a change, the old preview stays visible and is marked as outdated. (#202)
* **Multiple choice:** an optional short line tells students how to withdraw a cross and choose a box again. (#193)
* **Better protection for your data:** students' pseudonyms and encrypted records are better protected, and you confirm once in this browser after changing your password, recovery code or passkeys on another device. Results deleted from the server can be restored from Settings. (#189, #195)
* **New documentation website** with a user guide in German and English, linked in the app footer. The in-app help is shorter and links straight to the matching section: https://docs.examance.de (#184, #186)
* **Smaller fixes:** the exercise editor no longer overlaps on small or zoomed screens, and grading checkmarks keep their size in scaled drawings. (#190, #200)
* **Behind the scenes:** server-side PDF compiling runs in the background so long exams no longer time out, plus security hardening, automated layout and accessibility checks, and dependency updates. (#185, #194, #195)

**Full Changelog**: https://github.com/ValentinHerrmann/Examance/compare/0.4.4...0.5.0
