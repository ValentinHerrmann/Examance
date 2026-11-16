<script lang="ts">
  import { t } from "#lib/i18n";
  import { nameInfoOf, type SheetSketchModel, type SketchPart } from "#lib/exam/sheetSketch";

  /** The Layout preview's side panel (issue #272): where the student's name appears, and what each numbered element on the shown page is for. */
  interface Props {
    model: SheetSketchModel;
    /** The shown page's elements, in the order of their numbered badges. */
    parts: SketchPart[];
    /** Out: the element under the pointer or focus, to stress it on the page. */
    highlight?: SketchPart | null;
  }

  let { model, parts, highlight = $bindable(null) }: Props = $props();

  let name = $derived(nameInfoOf(model));
</script>

<div class="flex min-w-0 flex-col gap-4 text-sm">
  <section class="flex flex-col gap-1.5" aria-labelledby="sketch-name">
    <h3 id="sketch-name" class="m-0 text-xs font-semibold tracking-wide text-muted uppercase">{$t("exam.layout.sketch.info.nameHeading")}</h3>
    <ul class="m-0 flex list-none flex-col gap-1 p-0">
      {#each name.places as place (place)}
        <li class="text-content">{$t(`exam.layout.sketch.info.place.${place}`)}</li>
      {/each}
    </ul>
    <p class="m-0 rounded-md bg-surface-sunken p-2 text-content">{$t(name.visibleOnGraded ? "exam.layout.sketch.info.visible" : "exam.layout.sketch.info.hidden")}</p>
  </section>

  <section class="flex flex-col gap-1.5" aria-labelledby="sketch-page">
    <h3 id="sketch-page" class="m-0 text-xs font-semibold tracking-wide text-muted uppercase">{$t("exam.layout.sketch.info.pageHeading")}</h3>
    {#if parts.length}
      <ol class="m-0 flex list-none flex-col gap-1 p-0">
        {#each parts as part, i (part)}
          <li>
            <button
              type="button"
              class="flex w-full items-start gap-2 rounded-md p-1.5 text-left {highlight === part ? 'bg-highlight text-on-highlight' : 'hover:bg-surface-inset'}"
              onpointerenter={() => (highlight = part)}
              onpointerleave={() => (highlight = null)}
              onfocus={() => (highlight = part)}
              onblur={() => (highlight = null)}
            >
              <span class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-content text-xs font-bold text-surface-raised" aria-hidden="true">{i + 1}</span>
              <span class="min-w-0">
                <span class="block font-medium">{$t(`exam.layout.sketch.info.part.${part}.title`)}</span>
                <span class="block text-xs {highlight === part ? '' : 'text-muted'}">{$t(`exam.layout.sketch.info.part.${part}.text`)}</span>
              </span>
            </button>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="m-0 text-muted">{$t("exam.layout.sketch.info.nothing")}</p>
    {/if}
  </section>
</div>
