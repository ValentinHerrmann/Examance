<script lang="ts">
  import { t } from "#lib/i18n";
  import { POSTERS } from "#lib/about/posters";
  import { Card, Icon } from "#lib/components/ui";
  import { faArrowRight, faLightbulb } from "@fortawesome/free-solid-svg-icons";

  /** Sign-in and registration pages: points newcomers to the info posters (issue #119). */
  interface Props {
    class?: string;
  }

  let { class: className = "" }: Props = $props();
</script>

<Card class="mx-auto w-full max-w-form {className}">
  <div class="flex items-start gap-3">
    <Icon icon={faLightbulb} class="mt-1 shrink-0 text-xl text-info-fg" />
    <div class="min-w-0">
      <h2 class="m-0 text-base font-semibold text-content">{$t("about.teaser.title")}</h2>
      <p class="mt-1 mb-2 text-sm text-muted">{$t("about.teaser.text")}</p>
      <ul class="m-0 flex list-none flex-col gap-1 p-0">
        {#each POSTERS as poster (poster.id)}
          <li>
            <a
              href="/about?poster={poster.id}"
              class="inline-flex items-center gap-2 text-sm text-accent no-underline hover:underline pointer-coarse:min-h-11"
            >
              {$t(`about.teaser.${poster.id}`)}
              <Icon icon={faArrowRight} class="text-xs" />
            </a>
          </li>
        {/each}
      </ul>
    </div>
  </div>
</Card>
