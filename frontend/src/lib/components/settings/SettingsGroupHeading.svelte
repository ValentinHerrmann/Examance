<script lang="ts">
  interface Props {
    id: string;
    title: string;
  }

  let { id, title }: Props = $props();
</script>

<!-- Divider-style heading that groups the setting cards below it; also the SectionNav anchor. -->
<h2
  {id}
  class="m-0 mt-4 scroll-mt-16 border-b border-line px-1 pb-1 text-sm font-semibold tracking-wide text-muted uppercase first:mt-0 lg:scroll-mt-4"
>
  {title}
</h2>
