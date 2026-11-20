<script lang="ts">
  import { faCheck, faCircleExclamation, faSpinner } from "@fortawesome/free-solid-svg-icons";
  import Icon from "./Icon.svelte";
  import { t } from "#lib/i18n";
  import type { AutosaveStatus } from "#lib/utils/autosave";

  /** The one "Saving… / Saved" line of a self-saving form (`utils/autosave.ts`, issue #228), for a card or tab header. */
  interface Props {
    status: AutosaveStatus;
    class?: string;
    /** Class for the "Saving…"/"Saved" words (e.g. `lg:sr-only` for an icon-only status); a failure always shows its text. */
    labelClass?: string;
  }

  let { status, class: className = "", labelClass = "" }: Props = $props();
</script>

<span class="inline-flex min-w-0 items-center gap-1.5 text-sm {status.state === 'error' ? 'text-danger-fg' : 'text-muted'} {className}" role="status">
  {#if status.state === "pending" || status.state === "saving"}
    <Icon icon={faSpinner} spin /><span class={labelClass}>{$t("common.saving")}</span>
  {:else if status.state === "saved"}
    <Icon icon={faCheck} class="text-success-fg" /><span class={labelClass}>{$t("common.saved")}</span>
  {:else if status.state === "error"}
    <Icon icon={faCircleExclamation} /><span class="min-w-0">{$t("common.saveFailed", { message: status.error })}</span>
  {/if}
</span>
