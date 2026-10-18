<script lang="ts">
  import { REQUIREMENT_LEVELS, parseExerciseStructure } from "#lib/latex/exerciseStructure";
  import { t } from "#lib/i18n";
  import { Badge } from "#lib/components/ui";

  interface Props {
    /** The exercise's LaTeX body; requirement levels, competencies and parts are read from it. */
    latex: string | null | undefined;
    size?: "xs" | "sm";
  }

  let { latex, size = "sm" }: Props = $props();

  let structure = $derived(parseExerciseStructure(latex));
  // The exercise's own tags plus those of its parts, without duplicates.
  let levels = $derived.by(() => {
    const all = new Set([...structure.levels, ...structure.parts.flatMap((p) => p.levels)]);
    const known = REQUIREMENT_LEVELS.filter((l) => all.has(l));
    return [...known, ...[...all].filter((l) => !(REQUIREMENT_LEVELS as readonly string[]).includes(l))];
  });
  let competencies = $derived([...new Set([...structure.competencies, ...structure.parts.flatMap((p) => p.competencies)])]);
</script>

{#if levels.length > 0}
  <Badge {size} severity="info">{$t("exercises.structure.levelBadge", { level: levels.join("/") })}</Badge>
{/if}
{#each competencies as competency}
  <Badge {size}>{competency}</Badge>
{/each}
{#if structure.parts.length > 0}
  <Badge {size}>{$t("exercises.structure.partsBadge", { count: structure.parts.length })}</Badge>
{/if}
