---
editLink: false
---

# Erste Schritte

Examance begleitet eine Prüfung von Anfang bis Ende: Aufgaben sammeln, die Prüfung setzen, die gescannten Bögen einlesen, anonym korrigieren und die Ergebnisse auswerten. Alles Sensible (Namen, Scans, Anmerkungen, Punkte) wird in Ihrem Browser verschlüsselt, bevor es gespeichert wird. Der Schlüssel wird aus Ihrem Passwort abgeleitet und verlässt Ihr Gerät nie, sodass nicht einmal die Betreiber des Servers die Daten lesen können.

Dieses Benutzerhandbuch erklärt jede Seite im Detail. In der App öffnen die **?**-Schaltflächen (oder **F1**) eine kurze Hilfe zur aktuellen Seite, mit Links auf den passenden Abschnitt hier.

![Startseite](../../screenshots/pitch/01-dashboard.jpg)

## 1. Konto erhalten {#account}

Alle melden sich mit einem Konto auf einem Examance-Server an. Es gibt drei Wege zu einem Konto:

- **Einladung**: Eine Administratorin oder ein Administrator Ihrer Installation lädt Ihre E-Mail-Adresse ein; Sie folgen dem Link und wählen ein Passwort.
- **Konto beantragen** auf der Anmeldeseite: Sie geben Ihre E-Mail-Adresse ein, folgen dem Bestätigungslink und wählen ein Passwort; erst dann entsteht das Konto. Steht die Domain Ihrer Schule auf der Liste der erlaubten Domains der Installation, ist das Konto sofort aktiv. Andernfalls gibt die Administration es zuerst frei: Bis dahin meldet die Anmeldung nur „wartet auf Freigabe“, und Sie erhalten eine E-Mail, sobald das Konto freigeschaltet ist.
- **Einrichtung durch den Betrieb** bei der Installation des Servers.

Die Beantragungsseite verrät bewusst nicht, ob es für eine Adresse bereits ein Konto gibt. Kommt die E-Mail nicht an, sehen Sie im Spam-Ordner nach.

Ihre Administration legt außerdem fest, was Ihr Konto nutzen darf (Ergebnisse auf dem Server, LaTeX auf dem Server, Aufgaben teilen). Optionen, die Sie nicht nutzen dürfen, zeigt die App als „nicht freigeschaltet“ an.

## 2. Zweiten Faktor einrichten {#second-factor}

Bei der ersten Anmeldung richten Sie einen zweiten Anmeldefaktor ein: einen **Passkey** (wird zuerst angeboten) oder eine **Authenticator-App**. Richten Sie nach Möglichkeit beides ein, dazu ein Passwort: Dann ist der Verlust eines einzelnen Faktors nur lästig. Einzelheiten: [Anmeldung und Sicherheit](./security#factors).

![Zweiter Faktor bei der Anmeldung](../../screenshots/pitch/12-signin-second-factor.jpg)

### Wiederherstellungscode aufbewahren {#recovery-code}

Examance zeigt Ihnen einen **Wiederherstellungscode** genau einmal. Bewahren Sie ihn außerhalb des Browsers auf, auf Papier oder in einem Passwortmanager: Ohne Ihr Passwort oder diesen Code lassen sich Ihre verschlüsselten Daten nicht wiederherstellen, auch nicht durch die Administration. Siehe [Passwort vergessen](./security#reset-password).

## 3. Speicherort der Ergebnisse wählen {#storage}

Bei der ersten Anmeldung wählen Sie einen Speicherort für Ihr Konto. Es gibt keine Voreinstellung; die Wahl gilt in jedem Browser, den Sie verwenden.

| Modus | Aufgaben und Prüfungen | Ergebnisse (Schülerdaten, Scans, Punkte) |
|---|---|---|
| **Alles auf dem Server** | auf dem Server | auf dem Server, verschlüsselt; in jedem Browser Ihres Kontos verfügbar |
| **Hybrid** | auf dem Server | nur in dem Browser, in dem Sie sie erfasst haben, verschlüsselt in dessen lokaler Datenbank |

Sichern Sie im Hybrid-Modus Ihre Ergebnisse regelmäßig mit einem [`.examance`-Archiv](./backup), denn sie liegen nur in diesem einen Browser. Den Modus können Sie später in den [Einstellungen](./settings#switching) wechseln; Examance verschiebt die Ergebnisse Prüfung für Prüfung und prüft, dass alles angekommen ist, bevor es umschaltet. Ob „Alles auf dem Server“ angeboten wird, hängt von Ihrer Installation ab.

![Wahl des Speicherorts](../../screenshots/pitch/13-storage-choice.jpg)

## 4. Mit Beispieldaten ausprobieren {#example-data}

In der noch leeren Prüfungsübersicht legt **Beispieldaten hinzufügen** Beispielaufgaben, zwei Beispielprüfungen und korrigierte Bögen erfundener Schülerinnen und Schüler an, darunter gescannte. Sie werden nicht geteilt, wie Ihre eigenen Daten gespeichert und verschlüsselt und lassen sich wie jede andere Prüfung und Aufgabe löschen.

## Sich zurechtfinden {#navigation}

- Die **Navigationsleiste** führt zu den Prüfungen (Startseite), zur Aufgabenbibliothek, zur Auswertung, zu den Einstellungen und zum Hilfebereich. Dort lassen sich auch Sprache und Farbschema umschalten.
- Jede Prüfung hat eigene Schritte: **Einrichtung & Aufgaben**, **Scans**, **MC prüfen**, **Korrektur**, **Papier & Excel**, **Auswertung**.
- **Viele Namen sind anklickbar.** Aufgaben öffnen sich überall direkt im Editor (auf der Prüfungsseite, beim Korrigieren, in der Auswertung); Prüfungen in der Bibliothek öffnen sich als Übersicht mit **In neuem Tab öffnen**. Namen mit dem Symbol **↗**, etwa Schülerinnen und Schüler, öffnen sich in einem neuen Tab, damit ungespeicherte Arbeit im aktuellen Tab erhalten bleibt.
- Das **Arbeitsbereich-Menü** enthält Import, Sicherung und Export Ihres gesamten Arbeitsbereichs.

## Hilfe und Dokumentation {#help-and-docs}

- **?** neben einer Überschrift oder **F1** öffnet die Hilfe zur jeweiligen Seite. Sie gibt eine schnelle Orientierung; **Mehr in der Dokumentation** führt zum passenden Abschnitt dieses Handbuchs.
- **Vollständiges Handbuch öffnen** am Ende des Hilfebereichs zeigt alle Hilfethemen auf einer Seite. Es ist auch von der Anmeldeseite aus verlinkt.
- **Dokumentation** in der Fußzeile öffnet dieses Handbuch.
- [Infomaterial](./material): Foliensätze und Poster mit einem Rundgang in Screenshots und einer Erklärung zu Datenschutz und Sicherheit, auf Deutsch.

## Nächste Schritte {#next-steps}

- [Von der Aufgabe zur Auswertung](./workflow): der übliche Ablauf, Schritt für Schritt.
- [Aufgabenbibliothek](./exercises) und [Prüfung erstellen](./exams), um Ihre erste Prüfung vorzubereiten.
- [Datenfluss und Sicherheit (Englisch)](../../data_flow_and_security): wie die Verschlüsselung funktioniert, für technisch Interessierte.
