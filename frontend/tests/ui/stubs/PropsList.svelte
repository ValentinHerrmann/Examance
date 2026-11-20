<script lang="ts">
  // Test stand-in for a child component that may be mounted several times: each instance keeps its latest props in `globalThis.__propsList`.
  let props: Record<string, unknown> = $props();
  const list = ((globalThis as { __propsList?: Record<string, unknown>[] }).__propsList ??= []);
  const entry: Record<string, unknown> = {};
  list.push(entry);
  $effect.pre(() => {
    Object.assign(entry, { ...props });
  });
</script>
