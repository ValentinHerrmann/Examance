---
editLink: false
---

# For administrators

Administrators of an Examance installation manage **accounts and the server**, nothing else. This page covers the user management in the app; installing and running the server is described in [Setup and updates](../hosting) and [Accounts and administration](../account_creation_and_management).

## Roles {#roles}

- **Teachers** work with exams, exercises and results, and see only their own.
- **Administrators** manage accounts and the server only. They cannot create or open exams or exercises; the app shows them just user management, settings and help. Someone who administers and also teaches uses **two accounts**.

Administrators get no access to anyone's exam content either, because it is encrypted in the teacher's browser. The one exception are [layout reports](#layout-reports), which a teacher sends on purpose.

## Invite someone {#invite}

**User Management → Invite**: enter an e-mail address and **Send invitation**. The account is approved right away and the address counts as confirmed; the person chooses a password through the link in the e-mail.

## Approve registrations {#approvals}

People can also **request an account** on the sign-in page. After they confirm their e-mail address and choose a password, the registration waits under **Approvals** (unless their domain is always allowed, see below). **Approve** activates the account and notifies the person by e-mail; **Reject** deletes the registration and sends a short notice.

![Pending approvals](../screenshots/pitch/15-admin-approvals.jpg)

## Always-allowed domains {#domains}

Registrations from domains listed under **Domains** are approved automatically once the address is confirmed, with the features chosen there. Changes apply to future registrations only.

Only list domains whose mailboxes your institution hands out itself (for example the school's own domain), **never public e-mail providers**.

![Allowed domains](../screenshots/pitch/16-admin-domains.jpg)

## Features per account {#features}

Under **Accounts** you decide for every account what it may use:

| Feature | When off |
|---|---|
| **Student data and results on the server** | results stay in the teacher's browser (hybrid mode only) |
| **Compile LaTeX on the server** | the browser compiles |
| **Share and copy exercises** | no sharing, no copying of shared exercises |

Exams and exercises always live on the server. Options an account may not use show as "not enabled" for the teacher. Features can be changed at any time; turning off "student data on the server" makes the app move that teacher's results into their browser the next time it opens. Nothing is lost.

You can also delete accounts here (with the option to keep the exercises without a name).

![Account management](../screenshots/pitch/14-admin-accounts.jpg)

## Layout reports {#layout-reports}

When a teacher reports a LaTeX layout problem, administrators receive an e-mail without content, and the **Layout reports** tab shows the description, the attached LaTeX code, the PDFs and who reported it.

- If the teacher agreed to publication, the text under **For GitHub** contains no personal data and can be pasted into a new GitHub issue; then drag the PDFs into it. Otherwise the report must not be published.
- **Mark as resolved** notifies the teacher by e-mail, optionally with a note.

## Maintenance mode {#maintenance}

**User Management → Maintenance** announces a maintenance window with a lead time (0 minutes works too) and an expected duration:

- Signed-in teachers are reminded **5 minutes and 1 minute** before (with a lead time of 1 minute or less: at once and 10 seconds before).
- From the second reminder, sign-in is paused for everyone except administrators.
- From the start, no exam data can be changed until you end the maintenance.
- Optionally, the database is backed up when the maintenance starts; begin your work only once the backup is done.

The counters show how many teachers are online, how many saw the announcement and how many confirmed they saved their work. When nobody is signed in any more, **Start now** cuts the countdown short.

Updates on deployment announce themselves the same way (5 minutes ahead) and always back up the database first. Operator details: [Maintenance mode](../dev/maintenance_mode).
