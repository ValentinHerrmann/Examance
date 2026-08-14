<script lang="ts">
  /** Page heading, e.g. "Impressum". */
  export let title: string;
  /** Short line under the heading. */
  export let subtitle: string = "";
</script>

<article class="legal-page">
  <header>
    <h1>{title}</h1>
    {#if subtitle}
      <p class="legal-subtitle">{subtitle}</p>
    {/if}
  </header>

  <div class="legal-body">
    <slot />
  </div>

  <footer class="legal-footer">
    <a href="/">&larr; Back to Examance</a>
  </footer>
</article>

<style>
  .legal-page {
    max-width: 46rem;
    margin: 0 auto;
    padding: 2.5rem 1.25rem 4rem;
    color: #e2e8f0;
    line-height: 1.6;
  }

  h1 {
    margin: 0 0 0.35rem;
    font-size: 1.75rem;
  }

  .legal-subtitle {
    margin: 0 0 2rem;
    color: #94a3b8;
    font-size: 0.9rem;
  }

  .legal-body :global(h2) {
    margin: 2rem 0 0.6rem;
    font-size: 1.1rem;
    color: #f1f5f9;
  }

  .legal-body :global(p),
  .legal-body :global(li) {
    color: #cbd5e1;
    font-size: 0.925rem;
  }

  .legal-body :global(ul) {
    padding-left: 1.25rem;
  }

  .legal-body :global(.placeholder) {
    display: inline-block;
    padding: 0 0.3rem;
    border-radius: 3px;
    background: #78350f;
    color: #fde68a;
    font-family: ui-monospace, monospace;
    font-size: 0.85em;
  }

  .legal-body :global(.todo-banner) {
    margin: 0 0 1.5rem;
    padding: 0.75rem 1rem;
    border: 1px solid #b45309;
    border-radius: 8px;
    background: rgba(180, 83, 9, 0.12);
    color: #fcd34d;
    font-size: 0.875rem;
  }

  .legal-footer {
    margin-top: 3rem;
    padding-top: 1.25rem;
    border-top: 1px solid #334155;
  }

  .legal-footer a {
    color: #38bdf8;
    text-decoration: none;
    font-size: 0.9rem;
  }
</style>
