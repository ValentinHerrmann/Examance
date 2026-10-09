<script lang="ts">
  import type { Snippet } from "svelte";
  import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { legalOperatorConfigured } from "#lib/legal/operator";
  import { PageShell, PageHeader, Icon } from "#lib/components/ui";

  interface Props {
    /** Page heading, e.g. "Impressum". */
    title: string;
    /** Short line under the heading. */
    subtitle?: string;
    children?: Snippet;
  }

  let { title, subtitle = "", children }: Props = $props();
</script>

<PageShell width="narrow">
  <article class="leading-relaxed text-content">
    <PageHeader {title} subtitle={subtitle || undefined} />

    {#if !legalOperatorConfigured}
      <p class="mb-6 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-fg">
        <strong>{$t("legal.notConfigured.strong")}</strong>
        {$t("legal.notConfigured.text")}
      </p>
    {/if}

    <!-- The page bodies are plain h2/p/ul markup written in the route files, so they are styled from here. -->
    <div
      class="[&_.placeholder]:inline-block [&_.placeholder]:rounded-sm [&_.placeholder]:bg-warning/20 [&_.placeholder]:px-1 [&_.placeholder]:font-mono [&_.placeholder]:text-sm [&_.placeholder]:text-warning-fg [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-content [&_li]:text-sm [&_li+li]:mt-1 [&_p]:text-sm [&_p+p]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_p+ul]:mt-2 [&_ul+p]:mt-2 [&_.link]:break-words"
    >
      {@render children?.()}
    </div>

    <footer class="mt-8 border-t border-line pt-4">
      <a href="/" class="link inline-flex items-center gap-2 text-sm">
        <Icon icon={faArrowLeft} />{$t("legal.backToHome")}
      </a>
    </footer>
  </article>
</PageShell>
