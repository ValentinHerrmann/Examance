---
marp: true
paginate: true
size: 16:9
theme: default
style: |
  :root { --ink:#f8fafc; --navy:#0f172a; --slate:#1e293b; --cyan:#38bdf8; --muted:#94a3b8; --line:#334155; --coral:#fb7185; }
  section { background:var(--navy); color:var(--ink); font-family:"Segoe UI",sans-serif; padding:58px 72px; }
  h1 { font-size:2.9em; letter-spacing:-.04em; line-height:.98; color:var(--ink); }
  h2 { font-size:2em; letter-spacing:-.035em; line-height:1; color:var(--ink); }
  h3 { color:var(--coral); text-transform:uppercase; letter-spacing:.12em; font-size:1em; }
  p,li { font-size:.82em; line-height:1.35; }
  .eyebrow { color:var(--coral); text-transform:uppercase; letter-spacing:.16em; font-size:.55em; font-weight:700; }
  .deck { color:var(--muted); font-size:1em; max-width:730px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:34px; align-items:center; }
  .flow { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-top:38px; }
  .step { border-top:4px solid var(--coral); padding:16px 4px 0; min-height:130px; }
  .step b { display:block; font-size:1.6em; color:var(--coral); margin-bottom:12px; }
  .step span { color:var(--muted); font-size:.72em; }
  .panel { background:var(--slate); border:1px solid var(--line); border-radius:18px; padding:22px; }
  .quote { font-size:1.55em; line-height:1.12; border-left:4px solid var(--coral); padding-left:24px; }
  .metric { border-top:2px solid var(--coral); padding-top:13px; }
  .metric b { display:block; font-size:1.2em; margin-bottom:5px; }
  .metric span { color:var(--muted); font-size:.74em; }
  .legacy { border:1px solid var(--coral); padding:6px 9px; color:#fecdd3; border-radius:999px; font-size:.5em; letter-spacing:.08em; text-transform:uppercase; display:inline-block; }
  .concept { color:#bae6fd; border:1px solid var(--cyan); padding:6px 9px; border-radius:999px; font-size:.5em; letter-spacing:.08em; text-transform:uppercase; display:inline-block; }
  img { max-width:100%; max-height:480px; object-fit:contain; border-radius:14px; border:1px solid var(--line); }
  figure { margin:0; } figcaption { color:var(--muted); font-size:.48em; margin-top:8px; }
---

<div class="eyebrow">Examance / Für Lehrkräfte</div>

# Mehr Zeit für<br><span style="color:var(--coral)">gute Rückmeldung.</span>

<p class="deck">Der vertraute Papier-Test bleibt. Nur der mühsame Teil danach wird klarer, fairer und besser auswertbar.</p>

<div style="margin-top:70px"><span class="concept">VISUELLES KONZEPT / AKTUELLER UI-CAPTURE FOLGT</span></div>

---

<div class="eyebrow">01 / Der bekannte Nachmittag</div>

# Korrigieren ist wichtig.<br>Alles drumherum nicht.

<div class="grid">
<div><p class="quote">Namen, Punkte, Tabellen, Nachfragen. Die Rückmeldung an die Klasse wartet, während der Papierstapel wächst.</p></div>
<div><div class="metric"><b>Wiederverwenden</b><span>Aufgaben und Varianten bleiben auffindbar.</span></div><div class="metric"><b>Fairer korrigieren</b><span>Die Identität bleibt während des Markierens im Hintergrund.</span></div><div class="metric"><b>Schneller verstehen</b><span>Ergebnisse zeigen, was als Nächstes gelernt werden sollte.</span></div></div>
</div>

---

<div class="eyebrow">02 / Der Ablauf</div>

# Papier rein.<br><span style="color:var(--coral)">Klarheit raus.</span>

<div class="flow">
<div class="step"><b>01</b><span>Übung auswählen oder neu schreiben</span></div>
<div class="step"><b>02</b><span>Heft drucken und austeilen</span></div>
<div class="step"><b>03</b><span>Stapel scannen und korrigieren</span></div>
<div class="step"><b>04</b><span>Ergebnisse für die nächste Stunde lesen</span></div>
</div>

<div style="margin-top:48px"><span class="concept">CONCEPT / WORKFLOW DIAGRAM</span></div>

---

<div class="eyebrow">03 / Der Arbeitsplatz</div>

<div class="grid">
<figure><img src="../screenshots/pitch/05-exam-creation.png"><figcaption><span class="legacy">ALTE UI / LEGACY CAPTURE</span> Exam-Aufbau: als Produktbeleg markiert, aktueller Capture folgt.</figcaption></figure>
<div><h2>Ein Test, nicht fünf Dateien.</h2><p>Aufgaben, Punktelogik, Varianten und druckfertiger Satz gehören in einen Ablauf.</p><div class="panel"><strong>Für den Unterricht</strong><br><span style="color:var(--muted);font-size:.74em">Auch bestehende Papier- und LaTeX-Routinen bleiben anschlussfähig.</span></div></div>
</div>

---

<div class="eyebrow">04 / Wiederverwenden</div>

# Gute Aufgaben<br>müssen nicht verloren gehen.

<div class="grid">
<div><p>Eine Bibliothek für Übungen, Themen, Jahrgänge und Varianten. Änderungen bleiben sichtbar, statt sich in Kopien zu verstecken.</p><div class="metric"><b>Einmal pflegen.</b><span>In mehreren Prüfungen sinnvoll einsetzen.</span></div></div>
<figure><img src="../screenshots/pitch/04-exercise-library.png"><figcaption><span class="legacy">ALTE UI / LEGACY CAPTURE</span> Bibliothek: alte Oberfläche, nicht als aktueller Screenshot ausgeben.</figcaption></figure>
</div>

---

<div class="eyebrow">05 / Fairness</div>

# Erst die Antwort.<br><span style="color:var(--coral)">Dann der Name.</span>

<div class="grid">
<div><p class="quote">Beim Korrigieren zählt, was auf dem Blatt steht — nicht, wer darauf steht.</p><p style="color:var(--muted)">Die Korrektur ist pseudonym beziehungsweise identity-hidden. Die spätere Zuordnung für Noten und Verwaltung bleibt möglich.</p></div>
<figure><img src="../screenshots/pitch/placeholder-grading.svg"><figcaption><span class="concept">CONCEPT / NOT A SCREENSHOT</span> Visualisierung des Korrekturschritts.</figcaption></figure>
</div>

---

<div class="eyebrow">06 / Automatische Unterstützung</div>

# Automatik hilft.<br>Die Lehrkraft entscheidet.

<div class="grid">
<figure><img src="../screenshots/pitch/placeholder-omr.svg"><figcaption><span class="concept">CONCEPT / NOT A SCREENSHOT</span> OMR-Verifikation mit sichtbaren Unsicherheiten.</figcaption></figure>
<div><p>Bei MC- und SC-Aufgaben kann Examance Markierungen erkennen und zur Kontrolle vorlegen. Unklare Fälle bleiben sichtbar.</p><div class="panel"><strong>Wichtig</strong><br><span style="color:var(--muted);font-size:.74em">Kein blindes Vertrauen in eine Zahl. Ein kurzer Prüfpunkt im Arbeitsfluss.</span></div></div>
</div>

---

<div class="eyebrow">07 / Die nächste Stunde</div>

# Aus dem Ergebnis<br>wird eine Entscheidung.

<div class="grid">
<figure><img src="../screenshots/pitch/placeholder-analytics.svg"><figcaption><span class="concept">CONCEPT / NOT A SCREENSHOT</span> Beispielhafte Auswertung; Zahlen sind Demo-Daten.</figcaption></figure>
<div><div class="metric"><b>Wo hakt es?</b><span>Themen und Aufgaben sichtbar machen.</span></div><div class="metric"><b>Was war zu leicht?</b><span>Prüfungen über Zeit vergleichen.</span></div><div class="metric"><b>Was kommt jetzt?</b><span>Rückmeldung und Unterricht gezielter planen.</span></div></div>
</div>

---

<div class="eyebrow">08 / Vertrauen</div>

# Datenschutz verständlich<br>im Arbeitsablauf.

<div class="flow">
<div class="step"><b>Account</b><span>Jede Nutzung läuft über ein Serverkonto.</span></div>
<div class="step"><b>Schlüssel</b><span>Sensible Payloads werden clientseitig verschlüsselt.</span></div>
<div class="step"><b>Hybrid</b><span>Ergebnisse bleiben in diesem Browser.</span></div>
<div class="step"><b>Server</b><span>Ergebnisse können verschlüsselt auf dem Server liegen.</span></div>
</div>
<p class="deck" style="margin-top:42px">Die genaue Wahl hängt von Schulrichtlinie und Kontofähigkeiten ab. Pseudonym während der Korrektur bedeutet nicht anonym im gesamten Prozess.</p>

---

<div class="eyebrow">09 / Nächster Schritt</div>

# Ein echter Ablauf<br>ist die beste Produktdemo.

<p class="deck">Für einen sinnvollen Praxistest braucht es eine Prüfungssequenz, eine reale Korrekturroutine, freigegebene oder synthetische Beispieldaten und ehrliches Feedback zur Verständlichkeit.</p>
<div class="panel" style="margin-top:50px"><strong>Gesucht</strong><br><span style="color:var(--muted);font-size:.8em">Lehrkräfte, die sagen, wo der Ablauf Zeit spart, wo er Fragen aufwirft und welche Rückmeldung im Unterricht wirklich ankommt.</span></div>
