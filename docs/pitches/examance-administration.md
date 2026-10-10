---
marp: true
paginate: true
size: 16:9
theme: default
style: |
  :root { --ink:#f8fafc; --navy:#0f172a; --slate:#1e293b; --cyan:#38bdf8; --muted:#94a3b8; --line:#334155; --green:#5eead4; }
  section { background:var(--navy); color:var(--ink); font-family:"Segoe UI",sans-serif; padding:58px 72px; }
  h1 { font-size:2.8em; letter-spacing:-.04em; line-height:.98; color:var(--ink); }
  h2 { font-size:2em; letter-spacing:-.035em; line-height:1; color:var(--ink); }
  h3 { color:var(--green); text-transform:uppercase; letter-spacing:.12em; font-size:1em; }
  p,li { font-size:.78em; line-height:1.35; }
  .eyebrow { color:var(--green); text-transform:uppercase; letter-spacing:.16em; font-size:.55em; font-weight:700; }
  .deck { color:var(--muted); font-size:1em; max-width:760px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:34px; align-items:center; }
  .flow { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
  .step { background:var(--slate); border:1px solid var(--line); border-radius:14px; padding:17px 14px; min-height:125px; }
  .step b { color:var(--green); display:block; font-size:1.05em; margin-bottom:13px; }
  .step span { color:var(--muted); font-size:.65em; }
  .panel { background:var(--slate); border:1px solid var(--line); border-radius:18px; padding:22px; }
  .metric { border-top:2px solid var(--green); padding-top:12px; }
  .metric b { display:block; margin-bottom:5px; }
  .metric span { color:var(--muted); font-size:.72em; }
  .concept { color:#bae6fd; border:1px solid var(--cyan); padding:6px 9px; border-radius:999px; font-size:.5em; letter-spacing:.08em; text-transform:uppercase; display:inline-block; }
  .legacy { border:1px solid #fb7185; padding:6px 9px; color:#fecdd3; border-radius:999px; font-size:.5em; letter-spacing:.08em; text-transform:uppercase; display:inline-block; }
  img { max-width:100%; max-height:470px; object-fit:contain; border-radius:14px; border:1px solid var(--line); }
  figure { margin:0; } figcaption { color:var(--muted); font-size:.48em; margin-top:8px; }
  table { width:100%; border-collapse:collapse; font-size:.58em; } th,td { padding:10px; text-align:left; border-bottom:1px solid var(--line); } th { color:var(--green); }
---

<div class="eyebrow">Examance / Schulische Verantwortung</div>

# Innovation,<br><span style="color:var(--green)">die sich prüfen lässt.</span>

<p class="deck">Ein Bewertungsworkflow für Schulen, die Entlastung, Fairness und Datenschutz gemeinsam betrachten müssen.</p>
<div style="margin-top:70px"><span class="concept">CONCEPT / GOVERNANCE VISUALS ARE NOT DEPLOYMENT EVIDENCE</span></div>

---

<div class="eyebrow">01 / Die Entscheidung</div>

# Digital ist keine<br>Compliance-Strategie.

<div class="grid">
<div><p class="deck">Eine Einführung braucht mehr als eine Funktionsliste: Verantwortlichkeiten, Datenflüsse, Löschung, Konten, Hosting und die Grenzen des Produkts müssen sichtbar sein.</p></div>
<div><div class="metric"><b>Produktkontrolle</b><span>Verschlüsselung, Rollen, Speicheroptionen, Auditspuren.</span></div><div class="metric"><b>Schulentscheidung</b><span>Rechtsgrundlage, Aufbewahrung, Geräte, DPA, DPO-Prüfung.</span></div><div class="metric"><b>Pilotnachweis</b><span>Ein echter Ablauf mit messbaren und prüfbaren Kriterien.</span></div></div>
</div>

---

<div class="eyebrow">02 / Betriebsmodell</div>

# Wer sieht was?<br><span style="color:var(--green)">Und wer entscheidet?</span>

<div class="flow">
<div class="step"><b>Lehrkraft</b><span>Erstellt Exams, scannt, korrigiert und wertet aus.</span></div>
<div class="step"><b>Admin</b><span>Verwaltet Konten, Rollen und serverseitige Fähigkeiten.</span></div>
<div class="step"><b>Examance</b><span>Stellt Produkt, Backend und dokumentierte Kontrollen bereit.</span></div>
<div class="step"><b>Schule</b><span>Legt Zweck, Richtlinie, Fristen und Verantwortliche fest.</span></div>
</div>
<p class="deck" style="margin-top:36px">Die Rollen im Produkt ersetzen keine institutionelle Verantwortungszuweisung.</p>

---

<div class="eyebrow">03 / Datenfluss</div>

<div class="grid">
<div><h2>Verschlüsselung ist eine Grenze, keine Abkürzung.</h2><p>Sensible Payloads werden im Browser verschlüsselt. Exams und Übungen bleiben serververwaltet. Der Kontomodus entscheidet, wo Ergebnisse liegen.</p><div class="panel"><strong>Scope präzise halten</strong><br><span style="color:var(--muted);font-size:.72em">Pseudonymisierung während der Korrektur ist nicht dasselbe wie Anonymität. Server-Metadaten und institutionelle Pflichten bleiben relevant.</span></div></div>
<figure><img src="../screenshots/pitch/placeholder-analytics.svg"><figcaption><span class="concept">CONCEPT / NOT A SCREENSHOT</span> Konzeptvisualisierung; keine Darstellung eines konkreten Deployments.</figcaption></figure>
</div>

---

<div class="eyebrow">04 / Speicheroptionen</div>

# Zwei Speicherformen.<br>Eine Kontoverantwortung.

<table>
<tr><th></th><th>Hybrid</th><th>All-server</th></tr>
<tr><td><strong>Ergebnisse</strong></td><td>In diesem Browser, verschlüsselt</td><td>Auf dem Server, verschlüsselt</td></tr>
<tr><td><strong>Exams / Übungen</strong></td><td colspan="2">Serververwaltet</td></tr>
<tr><td><strong>Schlüssel</strong></td><td colspan="2">Bleibt clientseitig</td></tr>
<tr><td><strong>Entscheidung</strong></td><td colspan="2">Kontomodus und freigeschaltete Fähigkeiten</td></tr>
</table>
<p class="deck" style="margin-top:35px">Der passende Modus ist eine Governance- und Betriebsentscheidung, nicht nur eine Präferenz im UI.</p>

---

<div class="eyebrow">05 / Rollen und Fähigkeiten</div>

# Admins verwalten<br><span style="color:var(--green)">den Rahmen.</span>

<div class="grid">
<figure><img src="../screenshots/pitch/06-privacy-settings.png"><figcaption><span class="legacy">ALTE UI / LEGACY CAPTURE</span> Privacy settings: aktueller Capture und Admin-Ansicht fehlen noch.</figcaption></figure>
<div><div class="metric"><b>Server results</b><span>Ob All-server verfügbar ist.</span></div><div class="metric"><b>Server LaTeX</b><span>Welche Compile-Wege erlaubt sind.</span></div><div class="metric"><b>Exercise sharing</b><span>Ob gemeinsames Teilen freigeschaltet ist.</span></div><p style="color:var(--muted);font-size:.68em">Fähigkeiten müssen aus dem Account-Kontext kommen, nicht aus einer hard-codierten Marketingliste.</p></div>
</div>

---

<div class="eyebrow">06 / Vor dem Rollout</div>

# Die offenen Punkte<br>gehören auf den Tisch.

<div class="flow" style="grid-template-columns:repeat(3,1fr)">
<div class="step"><b>Recht</b><span>Rechtsgrundlage, DPA, DPIA, Art. 30, DPO-Prüfung.</span></div>
<div class="step"><b>Betrieb</b><span>Hosting, Subprozessoren, Backups, Löschfristen, private Geräte.</span></div>
<div class="step"><b>Produkt</b><span>Scanfehler, Wiederherstellung, Rollen, Support und Export.</span></div>
</div>
<div class="panel" style="margin-top:34px"><strong>Wichtig:</strong> Die vorhandenen Rechtsdokumente sind Arbeitsvorlagen und keine Rechtszertifizierung.</div>

---

<div class="eyebrow">07 / Pilotentscheidung</div>

# Erst ein kontrollierter<br><span style="color:var(--green)">Ablauf. Dann Skalierung.</span>

<div class="grid">
<div><p class="deck">Ein Pilot mit einer Abteilung oder einer Klasse macht Nutzen, Risiken und Verantwortlichkeiten sichtbar, bevor die Schule breiter ausrollt.</p><div class="metric"><b>Erfolgskriterien</b><span>Weniger manuelle Arbeit, bessere Rückmeldung, nachvollziehbare Datenflüsse, klarer Eskalationsweg.</span></div></div>
<div class="panel"><h3>Für die Entscheidung</h3><p>Eine reale Prüfungssequenz, synthetische oder freigegebene Daten, dokumentierte Schulrichtlinie und ein Review mit den Verantwortlichen.</p><span class="concept">CONCEPT / PILOT FRAMEWORK</span></div>
</div>
