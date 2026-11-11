<script lang="ts">
  import { untrack, type Snippet } from "svelte";
  import { t } from "#lib/i18n";
  import { Badge, Button, Field, Modal, Textarea, actionIcons, controlClass, controlCompactClass } from "#lib/components/ui";
  import SuggestInput from "./SuggestInput.svelte";
  import { bulkChanges, commonValue, type BulkField, type BulkItem } from "#lib/bulk/bulkEdit";

  /** The one multi-item field editor (exams and exercise groups, issue #261). A field shows the shared value or "various values"; only edited fields are written, an emptied field clears it, and every change is listed per item before applying. */
  interface Props {
    title: string;
    fields: BulkField[];
    items: BulkItem[];
    /** Button label for applying to `count` items. */
    applyLabel: (count: number) => string;
    busy?: boolean;
    error?: string;
    onApply: (patch: Record<string, string>) => void;
    onClose: () => void;
    /** Extra section under the fields (the exams' LaTeX packages). */
    extra?: Snippet;
    /** Extra review lines per item from `extra`; an item with lines counts as changed. */
    extraChanges?: (item: BulkItem) => string[];
  }

  let { title, fields, items, applyLabel, busy = false, error = "", onApply, onClose, extra, extraChanges = () => [] }: Props = $props();

  const initial: Record<string, string | null> = untrack(() => Object.fromEntries(fields.map((f) => [f.key, commonValue(items, f.key)])));
  // Local edit buffer of plain strings.
  let values = $state<Record<string, string>>(untrack(() => Object.fromEntries(fields.map((f) => [f.key, initial[f.key] ?? ""]))));
  // Fields with various values the teacher chose to empty everywhere.
  let cleared = $state<Record<string, boolean>>({});

  let patch = $derived.by(() => {
    const next: Record<string, string> = {};
    for (const f of fields) {
      const value = values[f.key].trim();
      if (cleared[f.key] || (initial[f.key] === null ? value !== "" : value !== initial[f.key])) next[f.key] = value;
    }
    return next;
  });
  let review = $derived(
    bulkChanges(items, patch)
      .map(({ item, changes }) => ({ item, changes, extra: extraChanges(item) }))
      .filter((r) => r.changes.length || r.extra.length),
  );
  const changedCount = (key: string) => (key in patch ? bulkChanges(items, { [key]: patch[key] }).filter((r) => r.changes.length).length : 0);
  const labelOf = (key: string) => fields.find((f) => f.key === key)?.label ?? key;
  const shown = (v: string) => v || "–";
  const input = `${controlClass} ${controlCompactClass}`;
</script>

<Modal open size="large" {title} {error} {onClose}>
  <div class="@container flex flex-col gap-4">
    <p class="m-0 text-sm text-muted">{$t("common.bulk.dialogHint", { count: items.length })}</p>
    <div class="grid grid-cols-1 gap-3 @lg:grid-cols-2">
      {#each fields as field (field.key)}
        {@const various = initial[field.key] === null}
        {@const changed = field.key in patch}
        <div class="min-w-0 rounded-md p-1.5 {changed ? 'border-2 border-accent bg-highlight' : 'border-2 border-transparent'} {field.multiline ? '@lg:col-span-2' : ''}">
          <Field compact label={field.label} forId="bulk-{field.key}">
            {#snippet children({ id })}
              {#if field.multiline}
                <Textarea {id} bind:value={values[field.key]} rows={2} maxlength={field.maxlength} placeholder={various && !cleared[field.key] ? $t("common.bulk.various") : field.placeholder} oninput={() => (cleared[field.key] = false)} />
              {:else}
                <SuggestInput
                  {id}
                  class={input}
                  storageKey={field.storageKey}
                  extraSuggestions={field.suggestions}
                  bind:value={values[field.key]}
                  maxlength={field.maxlength}
                  placeholder={various && !cleared[field.key] ? $t("common.bulk.various") : field.placeholder}
                  oninput={() => (cleared[field.key] = false)}
                />
              {/if}
            {/snippet}
          </Field>
          <div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {#if changed}
              <Badge size="xs" severity="info">{$t("common.bulk.fieldChanges", { count: changedCount(field.key), total: items.length })}</Badge>
              <Button size="sm" variant="text" severity="secondary" onClick={() => { values[field.key] = initial[field.key] ?? ""; cleared[field.key] = false; }}>{$t("common.bulk.undo")}</Button>
            {:else if various}
              <span class="text-muted">{$t("common.bulk.variousHint")}</span>
              <Button size="sm" variant="text" severity="secondary" onClick={() => (cleared[field.key] = true)}>{$t("common.bulk.clearAll")}</Button>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    {@render extra?.()}

    <section aria-live="polite" class="rounded-md border border-line p-3">
      <h3 class="m-0 mb-2 text-sm font-semibold text-content">{$t("common.bulk.reviewTitle", { count: review.length, total: items.length })}</h3>
      {#if review.length === 0}
        <p class="m-0 text-sm text-muted">{$t("common.bulk.reviewEmpty")}</p>
      {:else}
        <ul class="m-0 flex max-h-64 flex-col gap-2 overflow-y-auto pl-5 text-sm">
          {#each review as row (row.item.id)}
            <li>
              <strong>{row.item.title}</strong>
              <ul class="m-0 pl-4 text-muted">
                {#each row.changes as c (c.key)}
                  <li>{labelOf(c.key)}: <s>{shown(c.from)}</s> → <span class="font-medium text-content">{shown(c.to)}</span></li>
                {/each}
                {#each row.extra as line, i (i)}<li>{line}</li>{/each}
              </ul>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>

  {#snippet footer()}
    <Button variant="outlined" severity="secondary" icon={actionIcons.remove} onClick={onClose}>{$t("common.cancel")}</Button>
    <Button onClick={() => onApply(patch)} loading={busy} disabled={busy || review.length === 0}>{applyLabel(review.length)}</Button>
  {/snippet}
</Modal>
