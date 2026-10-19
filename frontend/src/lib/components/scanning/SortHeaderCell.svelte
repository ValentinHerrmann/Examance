<script lang="ts">
  import { t } from "#lib/i18n";
  import { Icon } from "#lib/components/ui";
  import { faSort, faSortDown, faSortUp } from "@fortawesome/free-solid-svg-icons";

  /** Column header that sorts its table; `direction` is null while another column (or none) sorts. */
  interface Props {
    label: string;
    direction: "asc" | "desc" | null;
    onToggle: () => void;
  }

  let { label, direction, onToggle }: Props = $props();

  const ARIA = { asc: "ascending", desc: "descending" } as const;
  const ICON = { asc: faSortUp, desc: faSortDown } as const;
</script>

<th scope="col" aria-sort={direction ? ARIA[direction] : "none"}>
  <button
    type="button"
    class="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 font-[inherit] text-inherit hover:text-accent"
    title={$t("common.sort.label") + ": " + label}
    onclick={onToggle}
  >
    {label}
    <Icon icon={direction ? ICON[direction] : faSort} class={direction ? "text-accent" : "text-subtle"} />
  </button>
</th>
