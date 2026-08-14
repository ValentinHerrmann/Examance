<script lang="ts">
  import LegalPage from "$lib/components/legal/LegalPage.svelte";
</script>

<svelte:head>
  <title>Impressum — Examance</title>
</svelte:head>

<LegalPage title="Impressum" subtitle="Anbieterkennzeichnung nach § 5 DDG">
  <p class="todo-banner">
    <strong>Vor dem Produktivbetrieb ausfüllen.</strong> Die markierten Felder
    müssen durch die Angaben des tatsächlichen Betreibers ersetzt werden. Ein
    unvollständiges Impressum ist abmahnfähig.
  </p>

  <h2>Diensteanbieter</h2>
  <p>
    <span class="placeholder">[Name der Schule / des Schulträgers]</span><br />
    <span class="placeholder">[Straße und Hausnummer]</span><br />
    <span class="placeholder">[PLZ und Ort]</span><br />
    Deutschland
  </p>

  <h2>Vertretungsberechtigt</h2>
  <p>
    <span class="placeholder">[Name der Schulleitung bzw. der vertretungsberechtigten Person]</span>
  </p>

  <h2>Kontakt</h2>
  <p>
    Telefon: <span class="placeholder">[Telefonnummer]</span><br />
    E-Mail: <span class="placeholder">[E-Mail-Adresse]</span>
  </p>

  <h2>Zuständige Aufsichtsbehörde</h2>
  <p>
    <span class="placeholder">[Zuständiges Staatliches Schulamt / Ministerium]</span>
  </p>

  <h2>Verantwortlich für den Inhalt</h2>
  <p>
    <span class="placeholder">[Name, Anschrift]</span>
  </p>

  <h2>Datenschutz</h2>
  <p>
    Informationen zur Verarbeitung personenbezogener Daten finden Sie in der
    <a href="/legal/datenschutz">Datenschutzerklärung</a>.
  </p>
</LegalPage>
