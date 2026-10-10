---
marp: true
paginate: false
size: A3
theme: examance-poster
style: |
  @page { size: A3 portrait; margin: 0; }
  :root { width: 297mm; height: 420mm; }
  section { width:297mm !important; height:420mm !important; background:#0f172a; color:#f8fafc; font-family:"Segoe UI",sans-serif; padding:15mm 16mm; }
  h1 { color:#f8fafc; font-size:2.7em; line-height:.92; letter-spacing:-.06em; margin:0 0 6mm; }
  h2 { color:#38bdf8; font-size:1.1em; text-transform:uppercase; letter-spacing:.13em; margin:0 0 4mm; }
  p,li { font-size:13px; line-height:1.3; } ul { padding-left:18px; }
  .eyebrow { color:#38bdf8; text-transform:uppercase; letter-spacing:.16em; font-size:13px; font-weight:700; }
  .hero { color:#cbd5e1; font-size:18px; line-height:1.2; margin-bottom:8mm; }
  .panel { background:#1e293b; border:1px solid #334155; border-radius:14px; padding:4mm; margin:3mm 0; }
  .flow { display:grid; grid-template-columns:repeat(2,1fr); gap:3mm; }
  .step { border-left:4px solid #38bdf8; padding:3mm 3mm 3mm 4mm; background:#1e293b; min-height:20mm; }
  .step b { display:block; color:#38bdf8; font-size:19px; margin-bottom:2mm; }
  .badge { display:inline-block; border:1px solid #fb7185; color:#fecdd3; border-radius:999px; padding:2mm 3mm; font-size:11px; letter-spacing:.08em; }
  .concept { display:inline-block; border:1px solid #38bdf8; color:#bae6fd; border-radius:999px; padding:2mm 3mm; font-size:11px; letter-spacing:.08em; }
  img { width:100%; max-height:76mm; object-fit:contain; border:1px solid #334155; border-radius:12px; }
  .footer { border-top:1px solid #334155; margin-top:5mm; padding-top:3mm; color:#94a3b8; font-size:11px; }
---

<div class="eyebrow">EXAMANCE / INFORMATIK</div>
<h1>Prüfungen,<br>die sich<br>testen lassen.</h1>
<p class="hero">LaTeX. Varianten. QR-Codes. Pseudonyme Korrektur. Ein durchgehender Workflow für echte Informatik-Klassen.</p>
<img src="../screenshots/pitch/placeholder-scan.svg">
<p><span class="concept">CONCEPT / NOT A SCREENSHOT</span></p>

<h2>Der technische Ablauf</h2>
<div class="flow">
<div class="step"><b>01 / Authoring</b>Übungen, Punkte und Varianten in einer Bibliothek.</div>
<div class="step"><b>02 / Druck</b>QR-codiertes Heft mit kontrollierten Versionen.</div>
<div class="step"><b>03 / Scan</b>Stapel importieren, Seiten per QR zuordnen.</div>
<div class="step"><b>04 / Korrektur</b>Antwort sehen, Identität im Arbeitsschritt ausblenden.</div>
<div class="step"><b>05 / OMR</b>Markierungen erkennen und Unsicherheiten prüfen.</div>
<div class="step"><b>06 / Analyse</b>Demo-Daten sichtbar als Grundlage für Feedback.</div>
</div>

<div class="panel"><h2>Für einen realistischen Pilot</h2><ul><li>Scanner und Auflösungen aus dem Schulalltag</li><li>echte Edge Cases bei QR und OMR</li><li>LaTeX-Vorlagen und Variantenlogik</li><li>Rückmeldung zur Korrekturerfahrung</li></ul><p>Benötigt werden ein realer Ablauf und freigegebene oder synthetische Beispieldaten.</p></div>
<div class="footer">Examance · Produktname aktuell · alle Visualisierungen mit Status gekennzeichnet</div>
