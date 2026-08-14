<script lang="ts">
  import LegalPage from "$lib/components/legal/LegalPage.svelte";
</script>

<svelte:head>
  <title>Datenschutzerklärung — Examance</title>
</svelte:head>

<LegalPage
  title="Datenschutzerklärung"
  subtitle="Informationen nach Art. 13 und 14 DSGVO"
>
  <p class="todo-banner">
    <strong>Vor dem Produktivbetrieb ausfüllen und rechtlich prüfen lassen.</strong>
    Die markierten Felder sind betreiberspezifisch. Die Rechtsgrundlage und die
    Aufbewahrungsfristen richten sich nach dem Schulrecht des jeweiligen Landes —
    siehe <code>docs/legal_audit_dsgvo.md</code>.
  </p>

  <h2>1. Verantwortlicher</h2>
  <p>
    <span class="placeholder">[Name und Anschrift der Schule als verantwortliche Stelle]</span>
  </p>

  <h2>2. Datenschutzbeauftragte / Datenschutzbeauftragter</h2>
  <p>
    <span class="placeholder">[Name, Anschrift, E-Mail]</span>
  </p>

  <h2>3. Zwecke und Rechtsgrundlage der Verarbeitung</h2>
  <p>
    Examance wird zur Erstellung, Durchführung und Bewertung schriftlicher
    Leistungsnachweise eingesetzt. Die Verarbeitung erfolgt zur Wahrnehmung einer
    Aufgabe, die im öffentlichen Interesse liegt bzw. in Ausübung öffentlicher
    Gewalt (Art. 6 Abs. 1 lit. e DSGVO) in Verbindung mit
    <span class="placeholder">[landesrechtliche Grundlage, in Bayern z. B. Art. 85 BayEUG i. V. m. BaySchO]</span>.
  </p>
  <p>
    Eine Einwilligung wird für diese Verarbeitung nicht eingeholt und ist nicht
    erforderlich; ein Widerruf ist daher nicht vorgesehen.
  </p>

  <h2>4. Kategorien personenbezogener Daten</h2>
  <ul>
    <li>Bei Schülerinnen und Schülern: Name, Kennnummer, abgegebene Prüfungsarbeit (Scan), Korrekturanmerkungen, erreichte Punktzahl.</li>
    <li>Bei Lehrkräften: E-Mail-Adresse, Rolle, Zeitpunkte von Anmeldungen und Exporten, gekürzter Hashwert der IP-Adresse.</li>
  </ul>

  <h2>5. Verschlüsselung und Speicherort</h2>
  <p>
    Identitätsdaten, Scans und Korrekturanmerkungen werden bereits im Browser
    verschlüsselt (AES-256-GCM), bevor sie gespeichert oder übertragen werden.
    Der Server erhält diese Inhalte ausschließlich als Chiffrat und besitzt den
    Schlüssel nicht. Im Standardmodus (<em>local-only</em>) verlassen die Daten
    das Gerät der Lehrkraft überhaupt nicht.
  </p>
  <p>
    Nicht verschlüsselt gespeichert werden serverseitig: die Gesamtpunktzahl je
    Pseudonym sowie Metadaten der Prüfung (Titel, Klasse, Fach, Datum).
    Pseudonymisierte Daten bleiben personenbezogene Daten im Sinne des
    Erwägungsgrundes 26 DSGVO.
  </p>

  <h2>6. Empfänger und Auftragsverarbeiter</h2>
  <ul>
    <li>Hosting der Weboberfläche: <span class="placeholder">[Cloudflare Pages, Cloudflare Inc., USA — Angemessenheitsbeschluss / Standardvertragsklauseln prüfen]</span></li>
    <li>Hosting von Datenbank und Cache: <span class="placeholder">[Anbieter, Standort]</span></li>
  </ul>

  <h2>7. Speicherdauer</h2>
  <p>
    Für jede Prüfung wird ein Aufbewahrungsdatum festgelegt. Nach dessen Ablauf
    werden Identitätsdaten und Abgaben nach einer Übergangsfrist von
    <span class="placeholder">[RETENTION_GRACE_DAYS]</span> Tagen unwiderruflich
    gelöscht. Protokolldaten werden nach
    <span class="placeholder">[AUDIT_LOG_RETENTION_DAYS]</span> Tagen gelöscht.
    Gesetzliche Aufbewahrungsfristen für Leistungsnachweise bleiben unberührt.
  </p>

  <h2>8. Ihre Rechte</h2>
  <p>
    Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung
    (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit
    (Art. 20) sowie Widerspruch gegen die Verarbeitung (Art. 21). Wenden Sie sich
    dafür an die oben genannte verantwortliche Stelle.
  </p>

  <h2>9. Beschwerderecht</h2>
  <p>
    Sie können sich bei einer Aufsichtsbehörde beschweren. Für bayerische
    öffentliche Schulen ist dies der Bayerische Landesbeauftragte für den
    Datenschutz (BayLfD), Wagmüllerstraße 18, 80538 München. In anderen Ländern
    ist die jeweils für öffentliche Stellen zuständige Aufsichtsbehörde
    einschlägig: <span class="placeholder">[zuständige Aufsichtsbehörde]</span>.
  </p>
</LegalPage>
