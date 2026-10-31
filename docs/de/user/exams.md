---
editLink: false
---

# Prüfung erstellen

Eine Prüfung besteht aus einer Auswahl von Aufgaben aus Ihrer Bibliothek, Kopfdaten, einem Notenschlüssel und einigen Layout-Optionen. Examance setzt sie als druckfertiges PDF mit einem QR-Code auf jedem Bogen, sodass sich die Scans später automatisch und anonym zuordnen lassen.

## Eine neue Prüfung anlegen {#new-exam}

**Neue Prüfung** (auf der Startseite) fragt nur die Kopfdaten ab, legt die Prüfung an und öffnet sie auf der Prüfungsseite. Alles Weitere (Aufgaben, Reihenfolge, MC-Gruppen, Logo, Pakete, Vorschau) erledigen Sie dort.

Die Prüfungsseite ist in Schritte gegliedert, die als Tabs (auf breiten Bildschirmen als Seitenleiste) angezeigt werden: **Einrichtung & Aufgaben**, **Scans**, **MC prüfen**, **Korrektur**, **Papier & Excel**, **Auswertung**.

### Kopfdaten {#header}

**Fach**, **Klasse**, **Testart**, **Datum** und **Nummer** erscheinen auf dem Deckblatt. Sie sind Prüfungsinhalt und werden deshalb immer auf Deutsch gedruckt, unabhängig von der Sprache der Oberfläche.

Das optionale **Thema** (zum Beispiel „Rekursion“) ordnet Ihre Prüfungen in der Übersicht, wo Sie danach filtern und suchen können. Es wird nie gedruckt. Die Übersicht lässt sich außerdem nach Datum, Titel, Jahrgang oder Fach sortieren.

Um die Kopfdaten später zu ändern, öffnen Sie **Prüfung bearbeiten** auf der Prüfungsseite.

## Aufgaben zusammenstellen {#assemble}

Auf der Prüfungsseite wählen Sie Aufgaben aus der Bibliothek (**Aufgaben hinzufügen**), jeweils mit der gewünschten Variante. Mit **Neue Aufgabe** schreiben Sie direkt dort eine neue; sie wird in Ihrer Bibliothek gespeichert und sofort ausgewählt.

- Mit den Pfeilen ändern Sie die Reihenfolge der Aufgaben.
- Die Gesamtpunktzahl wird laufend neu berechnet.
- Eine lange Aufgabe läuft einfach auf der nächsten Seite weiter; ihre Überschrift bleibt dabei immer mit den ersten Zeilen zusammen.

![Aufgaben für eine Prüfung auswählen](../../screenshots/pitch/04-exam-builder.jpg)

### Seitenumbrüche zwischen Aufgaben {#page-breaks}

Soll eine Aufgabe auf einer neuen Seite beginnen, fügen Sie zwischen zwei Aufgaben **Seitenumbruch einfügen** ein. Der Umbruch gehört zur Aufgabe darunter und wandert beim Verschieben mit. Seitenumbrüche *innerhalb* einer Aufgabe legen Sie in der Aufgabe selbst fest, siehe [Seitenumbrüche](./exercises#page-breaks).

Ändern Sie Seitenumbrüche, nachdem Sie die Antwortbogen-Vorlage für die MC-Erkennung erstellt haben, erzeugen Sie die Vorlage neu.

### MC-Gruppen {#mc-groups}

Mehrere Ankreuzaufgaben können gemeinsam als **MC-Gruppe** gedruckt werden. Gruppen legen und bearbeiten Sie auf der Prüfungsseite (**MC-Gruppen**). Eine Prüfung kann beliebig viele Gruppen beliebiger Größe enthalten; jede Frage gehört zu höchstens einer Gruppe.

Gruppen betreffen nur das Layout: Korrektur und Statistik bleiben strikt pro Frage.

## Notenschlüssel {#grading-key}

Der Notenschlüssel legt fest, welcher Prozentwert welche Note (1 bis 6) ergibt. Wählen Sie eine Voreinstellung oder legen Sie eigene Grenzen fest:

| Voreinstellung | Note 4 ab |
|---|---|
| **Klassisch** | 50 % |
| **Oberstufe** | 40 % |
| **Gleichmäßig** | gleichmäßig verteilte Grenzen |
| **Individuell** | Ihr eigener Mindestprozentwert je Note |

Beim Korrigieren werden die aktuelle Note und die Punkte bis zur nächsten Note laufend angezeigt. Die Statistik verwendet denselben Schlüssel.

## Layout-Optionen {#layout}

### Namenszeile {#name-line}

Mit **Namenszeile neben dem QR-Code-Feld drucken** (beim Anlegen der Prüfung oder unter **Prüfung bearbeiten**) erhält die Titelseite eine Zeile für den Namen der Schülerin oder des Schülers. Das QR-Code-Feld bleibt an derselben Stelle, Scannen und Zuordnen funktionieren also wie bisher; nur das Initialenfeld im Feld entfällt.

### Platz für weitere Lösungen {#extra-space}

**Platz für weitere Lösungen am Ende** (unter der Aufgabenliste) lässt den Schülerbogen mit einem Karo-Feld für zusätzliche Lösungen enden:

- eine Überschrift und darunter ein kleinerer Hinweis (mit Standardtexten vorbelegt, auf Deutsch gedruckt);
- eine **Mindesthöhe** und eine **Maximalhöhe** in cm. Das Feld füllt den Rest der letzten Seite; es beginnt nur dann eine neue Seite, wenn selbst die Mindesthöhe nicht mehr passt.

Der Erwartungshorizont enthält das Feld nicht.

### Logo und LaTeX-Pakete {#logo-packages}

Jede Prüfung druckt oben links auf der ersten Seite ein Logo. Unter **Prüfung bearbeiten** wählen Sie das Logo aus Ihren Einstellungen, kein Logo oder ein Logo nur für diese Prüfung (siehe [Logo auf der Prüfung](./settings#logo)). In der Prüfungsübersicht zeigt jede aufgeklappte Prüfung, welches Logo sie druckt.

Unter **Prüfung bearbeiten** können Sie außerdem LaTeX-Pakete nur für diese Prüfung hinzufügen oder Pakete Ihres Kontos weglassen (siehe [LaTeX-Pakete](./exercises#packages)).

## Setzen {#typeset}

**Live-Vorschau PDF** setzt die Prüfung und den Erwartungshorizont. Dabei entsteht ein druckfertiges PDF mit QR-Codes, je einer pro Prüfung, Variante und Schülerplatz.

Je nach Ihren Einstellungen und Ihrem Konto wird die Prüfung

- **in Ihrem Browser** gesetzt: Nichts verlässt Ihr Gerät, aber der erste Lauf lädt die LaTeX-Umgebung herunter und dauert länger;
- **auf dem Server** gesetzt: schneller auf schwacher Hardware; der LaTeX-Quelltext wird dabei an den Server gesendet.

Siehe [LaTeX-Kompilierung](./settings#latex). Sieht etwas falsch aus, [melden Sie ein Layoutproblem](./exercises#layout-reports); schlägt das Kompilieren fehl, siehe [Wenn das Kompilieren fehlschlägt](./exercises#compile-errors).

![Kompilierte Prüfung und Lösung](../../screenshots/pitch/04b-exam-setup.jpg)

### Vorschau aus der Übersicht {#preview}

In der Prüfungsübersicht öffnet **Vorschau** in einem aufgeklappten Eintrag das zuletzt kompilierte PDF. Gibt es noch keines, fragt Examance nach, kompiliert die Prüfung und zeigt sie direkt im Fenster an. Die Vorschau bleibt nur bis zum Neuladen der Seite erhalten.

## Drucken {#print}

Drucken Sie die Bögen **genau so, wie sie gesetzt wurden**: nicht „An Seite anpassen“, keine Skalierung, kein Beschneiden. Die QR-Codes und die Eckmarken müssen lesbar bleiben, sonst lässt sich der Scan nicht automatisch zuordnen und angekreuzte Kästchen werden nicht erkannt.

Nach der Prüfung geht es weiter mit [Scannen und Zuordnen](./scanning).

## Eine Prüfung duplizieren {#duplicate}

**Duplizieren** (in der Prüfungsübersicht und auf der Prüfungsseite) legt eine neue Prüfung mit denselben Kopfdaten, Aufgaben, MC-Gruppen, demselben Notenschlüssel und denselben Einstellungen an, zum Beispiel für eine Parallelklasse oder das nächste Schuljahr. Schülerdaten, Scans und Ergebnisse werden nie mitkopiert; die Kopie erhält eigene QR-Codes.

## Exportieren {#export}

**Exportieren** an einer Prüfung (Startseite oder Prüfungsseite) lädt sie entweder als lesbares ZIP oder als passwortgeschützte Sicherung herunter, siehe [Ergebnisse exportieren](./results#export) und [Sicherung und Übertragung](./backup#exam-backup).
