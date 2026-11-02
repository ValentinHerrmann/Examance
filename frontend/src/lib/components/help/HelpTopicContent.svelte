<script lang="ts">
  import { CrossLink } from "#lib/components/ui";
  import { locale, t } from "#lib/i18n";
  import { docsHref } from "#lib/help/docsLink";
  import type { HelpTopic } from "#lib/help/topics";

  interface Props {
    /** One manual topic, rendered identically in the panel and on `/help`. */
    topic: HelpTopic;
    /** `h2` on the manual page, `h3` inside the panel. */
    level?: "h2" | "h3";
  }

  let { topic, level = "h3" }: Props = $props();
</script>

<div class="min-w-0">
  <p class="mt-0 mb-4 text-sm text-muted">{$t(topic.summaryKey)}</p>

  {#each topic.sections as section (section.headingKey)}
    <section class="mb-5 last:mb-0">
      {#if level === "h2"}
        <h2 class="mt-0 mb-1.5 text-base font-semibold text-content">{$t(section.headingKey)}</h2>
      {:else}
        <h3 class="mt-0 mb-1.5 text-sm font-semibold text-content">{$t(section.headingKey)}</h3>
      {/if}

      {#each section.bodyKeys as key (key)}
        <p class="mt-0 mb-2 text-sm leading-relaxed text-muted last:mb-0">{$t(key)}</p>
      {/each}

      {#if section.bulletKeys}
        <ul class="m-0 list-disc pl-5 text-sm leading-relaxed text-muted">
          {#each section.bulletKeys as key (key)}
            <li class="mb-1 last:mb-0">{$t(key)}</li>
          {/each}
        </ul>
      {/if}

      <CrossLink href={docsHref(section.docs, $locale)} class="mt-1.5 text-sm">{$t("help.ui.docsLink")}</CrossLink>
    </section>
  {/each}
</div>
