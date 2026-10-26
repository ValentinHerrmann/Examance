<script lang="ts">
  import { t } from "#lib/i18n";
  import SuggestInput from "#lib/components/common/SuggestInput.svelte";
  import { Badge, Button, Checkbox, TextInput, controlClass, controlSmClass } from "#lib/components/ui";
  import { faBook, faTag } from "@fortawesome/free-solid-svg-icons";

  /** Metadata row of the exercise editor's header. Group fields are read-only once the exercise exists. */
  interface Props {
    name: string;
    topicTag: string;
    grade: string;
    subject: string;
    variantKey: string;
    questionType: "free_text" | "mc";
    shared: boolean;
    /** Editing or versioning an existing exercise: name, topic, grade and subject belong to the group. */
    existing: boolean;
    shareAllowed: boolean;
    onQuestionTypeChange: (type: "free_text" | "mc") => void;
  }

  let {
    name = $bindable(),
    topicTag = $bindable(),
    grade = $bindable(),
    subject = $bindable(),
    variantKey = $bindable(),
    questionType,
    shared = $bindable(),
    existing,
    shareAllowed,
    onQuestionTypeChange
  }: Props = $props();

  const field = "flex min-w-0 flex-col gap-0.5 text-xs";
  const label = "whitespace-nowrap font-semibold text-muted";
  const suggestClass = `${controlClass} ${controlSmClass}`;
</script>

{#snippet typeButton(type: "free_text" | "mc", text: string)}
  <Button
    size="sm"
    variant={questionType === type ? "solid" : "text"}
    severity={questionType === type ? "primary" : "secondary"}
    pressed={questionType === type}
    onClick={() => onQuestionTypeChange(type)}
  >{text}</Button>
{/snippet}

{#if existing}
  <div class="flex min-w-0 flex-wrap items-center gap-2 text-sm">
    <Badge icon={faTag}>{topicTag}</Badge>
    {#if grade}
      <Badge>{$t("exercises.editor.gradeBadge", { grade })}</Badge>
    {/if}
    {#if subject}
      <Badge icon={faBook}>{subject}</Badge>
    {/if}
    <div class="flex items-center gap-1.5 text-xs">
      <label for="editorVariantKey" class={label}>{$t("exercises.editor.variantKeyLabel")}</label>
      <TextInput id="editorVariantKey" size="sm" bind:value={variantKey} maxlength={100} placeholder={$t("exercises.editor.variantKeyPlaceholder")} />
    </div>
  </div>
{:else}
  <!-- Phones: two columns; from @3xl one row whose text fields share the free width. -->
  <div class="grid min-w-0 grid-cols-2 items-end gap-x-2 gap-y-1.5 @3xl:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
    <div class={field}>
      <label for="editorName" class={label}>{$t("exercises.editor.nameLabel")}</label>
      <TextInput id="editorName" size="sm" bind:value={name} maxlength={200} required placeholder={$t("exercises.editor.namePlaceholder")} />
    </div>
    <div class={field}>
      <label for="editorTopic" class={label}>{$t("exercises.editor.topicLabel")}</label>
      <SuggestInput id="editorTopic" storageKey="exercise.topic" bind:value={topicTag} maxlength={200} placeholder="_Vererbung" required class={suggestClass} />
    </div>
    <div class={field}>
      <label for="editorGrade" class={label}>{$t("exercises.editor.gradeLabel")}</label>
      <SuggestInput id="editorGrade" storageKey="exercise.grade" bind:value={grade} maxlength={50} placeholder={$t("exercises.editor.gradePlaceholder")} class={suggestClass} />
    </div>
    <div class={field}>
      <label for="editorSubject" class={label}>{$t("exercises.editor.subjectLabel")}</label>
      <SuggestInput id="editorSubject" storageKey="exercise.subject" bind:value={subject} maxlength={100} placeholder={$t("exercises.editor.subjectPlaceholder")} class={suggestClass} />
    </div>
    <div class={field}>
      <label for="editorVariantKey" class={label}>{$t("exercises.editor.variantKeyLabelPlain")}</label>
      <TextInput id="editorVariantKey" size="sm" bind:value={variantKey} maxlength={100} placeholder={$t("exercises.editor.variantKeyPlaceholderPlain")} />
    </div>
    <div class="col-span-2 flex flex-wrap items-end gap-3 @3xl:col-span-1">
      <div class={field}>
        <span class={label}>{$t("exercises.editor.exerciseTypeLabel")}</span>
        <div class="inline-flex gap-1 rounded-md border border-line bg-surface-sunken p-0.5">
          {@render typeButton("free_text", $t("exercises.editor.freeTextButton"))}
          {@render typeButton("mc", $t("exercises.editor.mcButton"))}
        </div>
      </div>
      {#if shareAllowed}
        <div class="pb-1.5 text-xs">
          <Checkbox bind:checked={shared} label={$t("exercises.sharing.editorShare")} />
        </div>
      {/if}
    </div>
  </div>
{/if}
