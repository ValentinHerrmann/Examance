<script lang="ts">
  import { t, translate } from "#lib/i18n";
  import { apiErrorMessage } from "#lib/api/client";
  import { setShareDefault } from "#lib/api/exerciseSharing";
  import { capabilitiesStore, featuresStore, markShareDefault } from "#lib/stores/capabilities";
  import { sessionStore } from "#lib/stores/session";
  import { Alert, Button, Card, Checkbox, OptionTile } from "#lib/components/ui";

  /** The remembered answer to the share question after saving an exercise (issue #263): ask, always share, never share. "Always" is standing consent, so it needs the same tick as the share dialog. */
  type Choice = "ask" | "always" | "never";
  const CHOICES: Choice[] = ["ask", "always", "never"];

  let current = $derived<Choice>(
    $capabilitiesStore?.shareNewExercises === true ? "always" : $capabilitiesStore?.shareNewExercises === false ? "never" : "ask",
  );
  let pendingAlways = $state(false);
  let confirmed = $state(false);
  let busy = $state(false);
  let error = $state("");

  async function save(choice: Choice) {
    busy = true;
    error = "";
    const value = choice === "always" ? true : choice === "never" ? false : null;
    try {
      await setShareDefault(value);
      markShareDefault(value);
      pendingAlways = false;
    } catch (err) {
      error = apiErrorMessage(err, translate("settings.shareDefault.failed"));
    } finally {
      busy = false;
    }
  }

  function pick(choice: Choice) {
    if (choice === "always") {
      // Consent first: the tile stays unselected until the tick is set and confirmed.
      pendingAlways = true;
      confirmed = false;
      return;
    }
    void save(choice);
  }
</script>

{#if $featuresStore.exercise_sharing === true}
  <div id="share-default" class="scroll-mt-16 lg:scroll-mt-4">
    <Card>
      <h2 class="m-0 mb-1 text-xl font-medium text-content">{$t("settings.shareDefault.heading")}</h2>
      <p class="mt-0 mb-4 text-sm text-muted">{$t("settings.shareDefault.description")}</p>
      <div class="flex flex-col gap-3">
        {#each CHOICES as choice (choice)}
          <OptionTile
            name="shareDefault"
            value={choice}
            checked={pendingAlways ? choice === "always" : current === choice}
            disabled={busy}
            title={$t(`settings.shareDefault.${choice}`)}
            text={$t(`settings.shareDefault.${choice}Hint`)}
            onchange={() => pick(choice)}
          />
        {/each}
      </div>
      {#if pendingAlways}
        <div class="mt-4 flex flex-col gap-3">
          <Alert severity="warning">{$t("exercises.sharing.shareModal.email", { email: $sessionStore.email ?? "" })}</Alert>
          <Checkbox bind:checked={confirmed} label={$t("settings.shareDefault.alwaysConfirm")} />
          <div class="flex flex-wrap justify-end gap-2">
            <Button variant="outlined" severity="secondary" size="sm" disabled={busy} onClick={() => (pendingAlways = false)}>{$t("common.cancel")}</Button>
            <Button size="sm" loading={busy} disabled={!confirmed} onClick={() => save("always")}>{$t("settings.shareDefault.alwaysSubmit")}</Button>
          </div>
        </div>
      {/if}
      {#if error}
        <Alert severity="danger" class="mt-3">{error}</Alert>
      {/if}
    </Card>
  </div>
{/if}
