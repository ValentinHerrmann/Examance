<script lang="ts">
  /** The address of the room timer Examtimer that "Open in Examtimer" points to (issue #265); kept in this browser, saved when the field is left. */
  import { t } from "#lib/i18n";
  import { Card, Field, TextInput } from "#lib/components/ui";
  import { DEFAULT_TIMER_URL, setTimerUrl, timerUrl } from "#lib/export/examTimer";

  let value = $state(timerUrl());
  let invalid = $state(false);

  function save() {
    invalid = !setTimerUrl(value);
    if (!invalid) value = timerUrl();
  }
</script>

<div id="examtimer" class="scroll-mt-16 lg:scroll-mt-4">
  <Card>
    <h2 class="m-0 mb-1 text-xl font-medium text-content">{$t("settings.examTimer.heading")}</h2>
    <p class="mt-0 mb-4 text-sm text-muted">{$t("settings.examTimer.description")}</p>
    <Field label={$t("settings.examTimer.address")} hint={invalid ? undefined : $t("settings.examTimer.hint")} error={invalid ? $t("settings.examTimer.invalid") : undefined}>
      {#snippet children({ id })}
        <TextInput {id} bind:value placeholder={DEFAULT_TIMER_URL} {invalid} onblur={save} onkeydown={(event) => event.key === "Enter" && save()} />
      {/snippet}
    </Field>
  </Card>
</div>
