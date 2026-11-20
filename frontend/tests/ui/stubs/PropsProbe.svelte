<script lang="ts">
  // Test stand-in for a child component: hands its latest props to the test through `globalThis.__probeProps`.
  let props: Record<string, unknown> = $props();
  $effect.pre(() => {
    (globalThis as { __probeProps?: Record<string, unknown> }).__probeProps = { ...props };
  });
</script>
