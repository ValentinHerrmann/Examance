<script lang="ts">
  import { onMount } from "svelte";
  import { getRecentValues, recordValue, removeValue } from "$lib/utils/recentValues";

  export let storageKey: string = "";
  export let extraSuggestions: string[] = [];
  export let value: string = "";
  export let id: string | undefined = undefined;
  export let placeholder: string = "";
  export let required: boolean = false;
  export let disabled: boolean = false;
  export let autocomplete: string | undefined = undefined;
  let className: string = "";
  export { className as class };
  export let maxSuggestions: number = 15;

  let recentList: string[] = [];
  let inputEl: HTMLInputElement;
  let wrapperEl: HTMLDivElement;
  let isOpen = false;
  let highlightedIndex = -1;

  const instanceId = Math.random().toString(36).substring(2, 9);
  $: dropdownId = id ? `${id}-listbox` : `suggest-listbox-${instanceId}`;

  onMount(() => {
    if (storageKey) {
      recentList = getRecentValues(storageKey);
    }
  });

  $: allSuggestions = Array.from(
    new Set([...recentList, ...(extraSuggestions || [])])
  ).filter((s) => typeof s === "string" && s.trim().length > 0);

  // Filter suggestions by current input text (case-insensitive), but always
  // show the full list when the field is empty.
  $: filteredSuggestions = value.trim()
    ? allSuggestions.filter((s) =>
        s.toLowerCase().includes(value.trim().toLowerCase())
      )
    : allSuggestions;

  function openDropdown() {
    isOpen = true;
    highlightedIndex = -1;
  }

  function closeDropdown() {
    isOpen = false;
    highlightedIndex = -1;
  }

  function selectSuggestion(s: string) {
    value = s;
    closeDropdown();
    commit();
    inputEl?.focus();
  }

  function handleRemove(e: MouseEvent, suggestion: string) {
    e.preventDefault();
    e.stopPropagation();
    if (storageKey) {
      recentList = removeValue(storageKey, suggestion);
    }
    if (highlightedIndex >= filteredSuggestions.length - 1) {
      highlightedIndex = Math.max(0, filteredSuggestions.length - 2);
    }
  }

  function handleFocus() {
    openDropdown();
  }

  function handleBlur() {
    // Delay so a click on a dropdown option registers before we close.
    setTimeout(() => {
      closeDropdown();
      commit();
    }, 120);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      openDropdown();
      return;
    }
    if (!isOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightedIndex = Math.min(
        highlightedIndex + 1,
        filteredSuggestions.length - 1
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && filteredSuggestions[highlightedIndex]) {
        e.preventDefault();
        selectSuggestion(filteredSuggestions[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      closeDropdown();
    }
  }

  export function commit() {
    if (storageKey && value && value.trim()) {
      recentList = recordValue(storageKey, value, maxSuggestions);
    }
  }
</script>

<div class="relative w-full" bind:this={wrapperEl}>
  <input
    bind:this={inputEl}
    {id}
    type="text"
    autocomplete="off"
    bind:value
    {placeholder}
    {required}
    {disabled}
    class="w-full {className}"
    on:input
    on:change
    on:focus={handleFocus}
    on:focus
    on:blur={handleBlur}
    on:keydown={handleKeydown}
    on:keydown
    role="combobox"
    aria-expanded={isOpen}
    aria-controls={isOpen ? dropdownId : undefined}
    aria-autocomplete="list"
  />

  {#if isOpen && !disabled}
    <ul
      id={dropdownId}
      class="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-[1100] m-0 max-h-56 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 p-1 shadow-2xl list-none"
      role="listbox"
    >
      {#if filteredSuggestions.length === 0}
        <li class="px-3 py-2 text-center text-xs italic text-slate-400 select-none">
          No previous entries yet
        </li>
      {:else}
        {#each filteredSuggestions as suggestion, i}
          <li
            role="option"
            aria-selected={i === highlightedIndex}
            class="group flex cursor-pointer items-center justify-between rounded-md px-3 py-1.5 text-sm text-slate-200 transition-colors {i === highlightedIndex ? 'bg-sky-600 text-white' : 'hover:bg-sky-600/80 hover:text-white'}"
            on:mousedown|preventDefault={() => selectSuggestion(suggestion)}
            on:mouseenter={() => (highlightedIndex = i)}
          >
            <span class="truncate">{suggestion}</span>
            {#if storageKey && recentList.includes(suggestion)}
              <button
                type="button"
                title="Remove entry"
                aria-label="Remove entry"
                class="ml-2 flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs text-slate-400 opacity-60 transition-opacity hover:bg-red-500/30 hover:text-red-300 group-hover:opacity-100"
                on:mousedown|preventDefault|stopPropagation={(e) => handleRemove(e, suggestion)}
              >
                ✕
              </button>
            {/if}
          </li>
        {/each}
      {/if}
    </ul>
  {/if}
</div>
