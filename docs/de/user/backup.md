---
editLink: false
---

# Sicherung und Übertragung

Ein passwortgeschütztes Archiv sichert Ihre Arbeit, überträgt sie in ein anderes Konto oder eine andere Installation oder teilt Ergebnisse mit einer Kollegin oder einem Kollegen. Es wird unabhängig von Ihrem Konto mit Ihrem eigenen Passwort verschlüsselt (Argon2id + AES-256-GCM).

Im **Hybrid-Modus** ist dieses Archiv die **wichtigste Sicherung** Ihrer Ergebnisse, weil sie nur in einem Browser liegen. Erstellen Sie regelmäßig eines.

## Den ganzen Arbeitsbereich sichern {#workspace-backup}

**Arbeitsbereich sichern oder teilen** im Arbeitsbereich-Menü erzeugt ein `.examance`-Archiv mit:

- allen Prüfungen samt ihren Logos (eine importierte Prüfung behält ihren Kopf);
- der ganzen Aufgabenbibliothek, einschließlich älterer Versionen, die eine Prüfung noch verwendet, und der Bild- und Ressourcendateien der Aufgaben;
- Schülerdaten, Scans, Anmerkungen und Punkten.

Nicht enthalten sind MC-Antwortbogen-Vorlagen (sie werden neu erzeugt) und Ihre Kontoeinstellungen.

## Eine einzelne Prüfung sichern {#exam-backup}

**Exportieren** an einer Prüfung (Startseite oder Prüfungsseite) mit dem Format **Wieder importierbare, passwortgeschützte Sicherung** erzeugt ein `.examance-exam`-Archiv, das nur diese Prüfung enthält, dazu ihre Aufgaben mit deren Dateien und ihre Ergebnisse.

Die Dateiendung zeigt den Umfang: `.examance` für einen ganzen Arbeitsbereich, `.examance-exam` für eine einzelne Prüfung. Ältere `.bgproj`-Sicherungen lassen sich weiterhin importieren.

## Ergebnisse ohne die Aufgaben teilen {#results-only}

Die Option **Ohne Aufgabentexte (zum Teilen der Ergebnisse)** exportiert dasselbe, aber **ohne LaTeX-Code und Dateien**. Aufgabennamen, Punktzahlen und MC-Lösungsschlüssel bleiben erhalten. So geben Sie Ergebnisse an eine Kollegin oder einen Kollegen weiter, ohne Ihre Aufgaben herauszugeben.

Wer ein solches Archiv importiert, kann die Prüfungen korrigieren und auswerten:

- sie tragen den Hinweis **Nur Ergebnisse**;
- Kompilieren, Bearbeiten und das Erstellen von MC-Antwortbogen-Vorlagen sind für diese Aufgaben gesperrt;
- die Aufgaben erscheinen nicht in der Bibliothek.

## Ein Archiv importieren {#import}

**Importieren** (Arbeitsbereich-Menü, Startseite oder Aufgabenbibliothek) liest ein Archiv wieder ein, in dasselbe oder ein anderes Konto, auch in einer anderen Examance-Installation. Sie brauchen das Passwort des Archivs.

- Eine Aufgabe, die Ihnen auf dem Server bereits gehört, wird **verknüpft** statt kopiert. Aufgaben, die andere Lehrkräfte teilen, werden nie verknüpft.
- Es wird nichts geschrieben, bevor das Archiv entschlüsselt und jeder Konflikt gelöst ist.

### Konflikte {#conflicts}

Gibt es eine Prüfung oder Aufgabe schon in einer anderen Version, fragt der Import, ob Sie

- **die vorhandene behalten** oder
- **die Archivfassung als Kopie importieren** möchten (die Kopie bringt ihre Bilddateien mit).

Überschrieben wird nie etwas. Für Schülerdaten und Abgaben können Sie stattdessen auch die Archivfassung übernehmen, etwa um Ergebnisse aus einer Sicherung wiederherzustellen.

### Bericht {#report}

Nach jedem Export und Import zeigt ein Bericht, was enthalten bzw. importiert wurde, was bewusst fehlt, welche verknüpften Aufgaben nicht verfügbar waren und welche Bilddateien nicht gelesen werden konnten.

## Archive sorgfältig behandeln {#care}

Ein Archiv enthält Schülerdaten. Geben Sie die Datei und ihr Passwort **getrennt** weiter (zum Beispiel die Datei per E-Mail und das Passwort telefonisch) und bewahren Sie Sicherungen dort auf, wo nur Sie Zugriff haben. Ohne das Passwort des Archivs kann niemand es öffnen, auch nicht die Administration.

Lesbare Exporte (CSV, ZIP mit PDFs) sind etwas anderes: Sie sind unverschlüsselt, siehe [Ergebnisse exportieren](./results#export).
