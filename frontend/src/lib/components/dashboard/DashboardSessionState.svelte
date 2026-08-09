<script lang="ts">
  export let mode: 'loading' | 'locked';
</script>

{#if mode === 'loading'}
  <div class="rounded-xl border border-dashed border-slate-700 bg-slate-800 px-8 py-16 text-center">
    <p>Initializing local session...</p>
  </div>
{:else}
  <div class="rounded-xl border border-dashed border-slate-700 bg-slate-800 px-8 py-16 text-center">
    <h2 class="m-0 text-[1.75rem] text-slate-50">Session Locked</h2>
    <p>Please unlock your session to access projects.</p>
    <a
      href="/unlock"
      class="rounded-md bg-sky-600 px-5 py-2.5 font-semibold text-white no-underline hover:bg-sky-700"
      >Unlock Session</a
    >
  </div>
{/if}
