<script lang="ts">
  import type { Snippet } from "svelte";
  import { faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import Icon from "./Icon.svelte";

  /** Link to a related exam, exercise or submission. Always a new tab, so unsaved work here survives (issue #151). */
  interface Props {
    href: string;
    title?: string | undefined;
    class?: string;
    children: Snippet;
  }

  let { href, title = undefined, class: className = "", children }: Props = $props();

  let tip = $derived(title ? `${title} (${$t("common.openInNewTab")})` : $t("common.openInNewTab"));
</script>

<a
  {href}
  target="_blank"
  rel="noopener noreferrer"
  title={tip}
  class="inline-flex min-w-0 items-center gap-1 text-accent hover:underline {className}"
  onclick={(e) => e.stopPropagation()}
>
  <span class="min-w-0 truncate">{@render children()}</span>
  <Icon icon={faUpRightFromSquare} class="text-[0.7em] opacity-70" />
</a>
