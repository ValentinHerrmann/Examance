<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "#lib/i18n";
  import type { ExamRecord } from "#lib/db/schema";
  import type { SketchPart } from "#lib/exam/sheetSketch";
  import type { LayoutField } from "#lib/exam/saveExamLayout";
  import { effectiveTemplates, fetchLayoutTemplates, matchPreset, replacedTexts, saveLayoutTemplates, type LayoutPresetId, type LayoutTemplate, type PresetFields, type StoredLayoutTemplate } from "#lib/exam/layoutPresets";
  import LayoutChoiceRow, { type LayoutChoice } from "#lib/components/exam/LayoutChoiceRow.svelte";
  import { actionIcons } from "#lib/components/ui/actionIcons";
  import { faArrowRotateLeft, faBook, faFloppyDisk, faPenNib, faQrcode, faUserSecret, faTriangleExclamation, type IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import { ConfirmDialog, Field, Icon, Menu, MenuItem, TextInput } from "#lib/components/ui";

  /** The Layout step's template row (issues #272, #279): four slots that set every setting of the page but the logo; the ⋮ menu saves the current settings into a slot, renames or resets it, stored per account. */
  interface Props {
    /** Every Layout-page setting as currently edited. */
    current: Required<Pick<ExamRecord, Exclude<LayoutField, "extraNotes">>> & Pick<ExamRecord, "extraNotes">;
    /** Sets the template's settings; free text only when it is part of *fields*. */
    onApply: (fields: PresetFields) => void;
    onHighlight?: (part: SketchPart, on: boolean) => void;
    onShow?: (part: SketchPart) => void;
  }

  let { current, onApply, onHighlight, onShow }: Props = $props();

  let stored = $state.raw<StoredLayoutTemplate[]>([]);
  let loadFailed = $state(false);
  let templates = $derived(effectiveTemplates(stored));
  let matched = $derived(matchPreset(current, templates));

  const icons: Record<LayoutPresetId, IconDefinition> = { examanceBooklet: faBook, examanceAnonymous: faQrcode, paperAnonymous: faUserSecret, paperClassic: faPenNib };
  const titleOf = (tpl: LayoutTemplate) => tpl.title ?? $t(`exam.layout.presets.${tpl.id}`);
  const textOf = (tpl: LayoutTemplate) => tpl.text ?? $t(`exam.layout.presets.${tpl.id}Text`);

  let choices = $derived<LayoutChoice[]>(templates.map((tpl) => ({ value: tpl.id, checked: matched === tpl.id, icon: icons[tpl.id], title: titleOf(tpl), text: textOf(tpl), onPick: () => pick(tpl) })));

  type Dialog = { kind: "save" | "reset" | "replace" | "rename"; tpl: LayoutTemplate } | null;
  let dialog = $state.raw<Dialog>(null);
  let busy = $state(false);
  let error = $state("");
  let nameDraft = $state("");
  let textDraft = $state("");

  onMount(() => {
    fetchLayoutTemplates()
      .then((list) => (stored = list))
      .catch(() => (loadFailed = true));
  });

  function open(kind: NonNullable<Dialog>["kind"], tpl: LayoutTemplate) {
    error = "";
    nameDraft = titleOf(tpl);
    textDraft = textOf(tpl);
    dialog = { kind, tpl };
  }

  /** Applies a template; its own text replaces the exam's only after asking. */
  function pick(tpl: LayoutTemplate) {
    if (replacedTexts(tpl.fields, current).length) open("replace", tpl);
    else onApply(tpl.fields);
  }

  function applyKeepingText(tpl: LayoutTemplate) {
    const { infoText: _info, extraNotes: _notes, ...choicesOnly } = tpl.fields;
    onApply(choicesOnly);
    dialog = null;
  }

  async function store(next: StoredLayoutTemplate[]) {
    busy = true;
    error = "";
    try {
      stored = await saveLayoutTemplates(next);
      dialog = null;
    } catch (err) {
      error = $t("exam.layout.presets.saveFailed", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      busy = false;
    }
  }

  /** The slot with *change* merged over what the account stored for it. */
  function withSlot(id: LayoutPresetId, change: Partial<StoredLayoutTemplate>): StoredLayoutTemplate[] {
    const own = stored.find((s) => s.id === id) ?? { id };
    return [...stored.filter((s) => s.id !== id), { ...own, ...change }];
  }

  function confirm() {
    if (!dialog) return;
    const { kind, tpl } = dialog;
    if (kind === "replace") {
      onApply(tpl.fields);
      dialog = null;
    } else if (kind === "save") {
      void store(withSlot(tpl.id, { fields: $state.snapshot(current) }));
    } else if (kind === "rename") {
      const builtinTitle = $t(`exam.layout.presets.${tpl.id}`);
      const builtinText = $t(`exam.layout.presets.${tpl.id}Text`);
      const title = nameDraft.trim();
      const text = textDraft.trim();
      void store(withSlot(tpl.id, { title: title && title !== builtinTitle ? title : null, text: text && text !== builtinText ? text : null }));
    } else {
      void store(stored.filter((s) => s.id !== tpl.id));
    }
  }

  let replaced = $derived(dialog?.kind === "replace" ? replacedTexts(dialog.tpl.fields, current) : []);
  const TEXT_LABEL = { infoText: "exam.layout.presets.replaceInfoText", extraNotes: "exam.layout.presets.replaceExtraNotes" } as const;
</script>

<div class="flex min-w-0 flex-col gap-1">
  <LayoutChoiceRow id="layout-presets" label={$t("exam.layout.presets.heading")} info={$t("exam.layout.presets.info")} columns={2} {choices} fallback={$t("exam.layout.presets.custom")} {onHighlight} {onShow}>
    {#snippet menu(choice)}
      {@const tpl = templates.find((x) => x.id === choice.value)!}
      <Menu label={$t("exam.layout.presets.menu", { name: choice.title })} icon={actionIcons.more} showLabel={false} chevron={false} triggerClass="inline-flex h-full min-h-9 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-inset pointer-coarse:min-w-11">
        <MenuItem icon={faFloppyDisk} onSelect={() => open("save", tpl)}>{$t("exam.layout.presets.saveInto")}</MenuItem>
        <MenuItem icon={actionIcons.edit} onSelect={() => open("rename", tpl)}>{$t("exam.layout.presets.rename")}</MenuItem>
        {#if tpl.edited}
          <MenuItem icon={faArrowRotateLeft} onSelect={() => open("reset", tpl)}>{$t("exam.layout.presets.reset")}</MenuItem>
        {/if}
      </Menu>
    {/snippet}
  </LayoutChoiceRow>
  {#if loadFailed}
    <p class="m-0 flex items-start gap-1.5 text-xs text-warning-fg @2xl:pl-44"><Icon icon={faTriangleExclamation} class="mt-0.5 shrink-0" />{$t("exam.layout.presets.loadFailed")}</p>
  {/if}
</div>

{#if dialog}
  {@const name = titleOf(dialog.tpl)}
  {#if dialog.kind === "replace"}
    <ConfirmDialog open title={$t("exam.layout.presets.replaceTitle")} message={$t("exam.layout.presets.replaceMessage", { name })} confirmText={$t("exam.layout.presets.replaceConfirm")} cancelText={$t("exam.layout.presets.replaceKeep")} role="dialog" onConfirm={confirm} onCancel={() => dialog && applyKeepingText(dialog.tpl)} onDismiss={() => (dialog = null)}>
      <ul class="m-0 list-disc pl-5 text-sm text-content">
        {#each replaced as key (key)}<li>{$t(TEXT_LABEL[key])}</li>{/each}
      </ul>
    </ConfirmDialog>
  {:else if dialog.kind === "rename"}
    <ConfirmDialog open title={$t("exam.layout.presets.renameTitle")} confirmText={$t("exam.layout.presets.renameConfirm")} cancelText={$t("common.cancel")} role="dialog" {busy} {error} onConfirm={confirm} onCancel={() => (dialog = null)}>
      <div class="flex flex-col gap-3">
        <Field label={$t("exam.layout.presets.nameLabel")} forId="layoutTemplateName">
          <TextInput id="layoutTemplateName" maxlength={80} bind:value={nameDraft} />
        </Field>
        <Field label={$t("exam.layout.presets.textLabel")} forId="layoutTemplateText">
          <TextInput id="layoutTemplateText" maxlength={200} bind:value={textDraft} />
        </Field>
      </div>
    </ConfirmDialog>
  {:else}
    {@const save = dialog.kind === "save"}
    <ConfirmDialog
      open
      title={$t(save ? "exam.layout.presets.saveTitle" : "exam.layout.presets.resetTitle")}
      message={$t(save ? "exam.layout.presets.saveMessage" : "exam.layout.presets.resetMessage", { name })}
      confirmText={$t(save ? "exam.layout.presets.saveConfirm" : "exam.layout.presets.resetConfirm")}
      cancelText={$t("common.cancel")}
      {busy}
      {error}
      onConfirm={confirm}
      onCancel={() => (dialog = null)}
    />
  {/if}
{/if}
