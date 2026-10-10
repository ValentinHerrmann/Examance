---
marp: true
paginate: false
size: A3
theme: examance-poster
style: |
  @page { size:A3 portrait; margin:0; }
  :root { width: 297mm; height: 420mm; }
  section { width:297mm !important; height:420mm !important; background:#0f172a; color:#f8fafc; font-family:"Segoe UI",sans-serif; padding:15mm 16mm; }
  h1 { color:#f8fafc; font-size:2.7em; line-height:.92; letter-spacing:-.06em; margin:0 0 6mm; }
  h2 { color:#5eead4; font-size:1.1em; text-transform:uppercase; letter-spacing:.13em; margin:0 0 4mm; }
  p,li { font-size:13px; line-height:1.3; } ul { padding-left:18px; }
  .eyebrow { color:#5eead4; text-transform:uppercase; letter-spacing:.16em; font-size:13px; font-weight:700; }
  .hero { color:#cbd5e1; font-size:18px; line-height:1.2; margin-bottom:8mm; }
  .panel { background:#1e293b; border:1px solid #334155; border-radius:14px; padding:4mm; margin:3mm 0; }
  .flow { display:grid; grid-template-columns:repeat(2,1fr); gap:3mm; }
  .step { border-left:4px solid #5eead4; padding:3mm 3mm 3mm 4mm; background:#1e293b; min-height:20mm; }
  .step b { display:block; color:#5eead4; font-size:19px; margin-bottom:2mm; }
  .concept { display:inline-block; border:1px solid #38bdf8; color:#bae6fd; border-radius:999px; padding:2mm 3mm; font-size:11px; letter-spacing:.08em; }
  .legacy { display:inline-block; border:1px solid #fb7185; color:#fecdd3; border-radius:999px; padding:2mm 3mm; font-size:11px; letter-spacing:.08em; }
  img { width:100%; max-height:72mm; object-fit:contain; border:1px solid #334155; border-radius:12px; }
  .footer { border-top:1px solid #334155; margin-top:5mm; padding-top:3mm; color:#94a3b8; font-size:11px; }
---

<div class="eyebrow">EXAMANCE / SCHULLEITUNG</div>
<h1>Innovation,<br><span style="color:#5eead4">die sich prüfen lässt.</span></h1>
<p class="hero">Ein Bewertungsworkflow für Entlastung, Fairness und Datenschutz mit klaren Verantwortungsgrenzen.</p>
<img src="../screenshots/pitch/placeholder-analytics.svg">
<p><span class="concept">CONCEPT / GOVERNANCE VISUAL</span></p>

<h2>Wer entscheidet was?</h2>
<div class="flow">
<div class="step"><b>Schule</b>Zweck, Rechtsgrundlage, Fristen, Geräte und Verantwortliche.</div>
<div class="step"><b>Lehrkraft</b>Prüfungen, Scans, Korrektur und fachliche Auswertung.</div>
<div class="step"><b>Admin</b>Konten, Rollen und freigeschaltete Fähigkeiten.</div>
<div class="step"><b>Examance</b>Produkt, Backend und dokumentierte technische Kontrollen.</div>
</div>

<div class="panel"><h2>Aktuelle Produktgrenzen</h2><ul><li>Exams und Übungen bleiben serververwaltet.</li><li>Ergebnisse liegen je nach Kontomodus hybrid oder all-server.</li><li>Sensible Payloads werden clientseitig verschlüsselt.</li><li>Pseudonyme Korrektur ist nicht gleich Anonymität.</li></ul></div>
<div class="panel"><h2>Vor dem Rollout</h2><ul><li>DPA, DPIA, Art. 30 und DPO-Prüfung</li><li>Hosting, Subprozessoren, Backups und Löschung</li><li>Private-Geräte-Regel und Supportprozess</li><li>Kontrollierter Pilot mit realem Ablauf</li></ul><p>Die vorhandenen Rechtsdokumente sind Arbeitsvorlagen, keine Rechtszertifizierung.</p></div>
<div class="footer">Examance · Governance-Visuals sind keine Deployment-Nachweise · Statuslabels nicht entfernen</div>
