<script lang="ts">
  import { onMount, onDestroy, untrack } from "svelte";
  import {
    stripBackendProtocol,
    inferBackendProtocol,
    knownServerSuggestions,
    isLoopbackHost,
  } from "$lib/stores/backendStore";
  import { getRecentValues, recordValue, removeValue } from "$lib/utils/recentValues";
  import { t } from "$lib/i18n";
  import { faCheck, faChevronDown, faXmark } from "@fortawesome/free-solid-svg-icons";
  import { Icon } from "$lib/components/ui";

  interface Props {
    value?: string;
    id?: string | undefined;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    storageKey?: string;
    extraSuggestions?: string[];
    class?: string;
  }

  let {
    value = $bindable(""),
    id = undefined,
    placeholder = "localhost:8000",
    required = false,
    disabled = false,
    storageKey = "backend.url",
    extraSuggestions = knownServerSuggestions(),
    class: className = "",
  }: Props = $props();

  let hostInput: string = $state(stripBackendProtocol(value || ""));
  let lastDispatchedValue = value;
  let isOpen = $state(false);
  let forceShowAll = $state(false);
  let highlightedIndex = $state(-1);
  let recentList: string[] = $state([]);

  let inputEl: HTMLInputElement | undefined = $state();
  let wrapperEl: HTMLDivElement | undefined = $state();
  let dropdownStyle = $state("");

  const instanceId = Math.random().toString(36).substring(2, 9);
  let dropdownId = $derived(id ? `${id}-backend-listbox` : `backend-listbox-${instanceId}`);

  // Sync external value -> hostInput without creating a reactive cycle
  $effect.pre(() => {
    const external = value;
    untrack(() => {
      if (external !== lastDispatchedValue) {
        lastDispatchedValue = external;
        hostInput = stripBackendProtocol(external || "");
      }
    });
  });

  // Reactive protocol inferred from hostInput
  let protocol = $derived(inferBackendProtocol(hostInput));

  interface ServerSuggestion {
    host: string;
    label: string;
    isCustom: boolean;
  }

  function getBadgeLabel(host: string): string {
    if (isLoopbackHost(host)) return "Local";
    if (host.toLowerCase().includes("prev")) return "Preview";
    if (host.toLowerCase().includes("api-examance") || host.toLowerCase().includes("prod")) return "Production";
    return "Custom";
  }

  let allSuggestions = $derived((() => {
    const known = extraSuggestions || knownServerSuggestions();
    const result: ServerSuggestion[] = [];
    const seen = new Set<string>();

    for (const raw of known) {
      const clean = stripBackendProtocol(raw).trim();
      if (!clean || seen.has(clean.toLowerCase())) continue;
      seen.add(clean.toLowerCase());
      result.push({
        host: clean,
        label: getBadgeLabel(clean),
        isCustom: false,
      });
    }

    for (const raw of recentList) {
      const clean = stripBackendProtocol(raw).trim();
      if (!clean || seen.has(clean.toLowerCase())) continue;
      seen.add(clean.toLowerCase());
      result.push({
        host: clean,
        label: "Custom",
        isCustom: true,
      });
    }

    return result;
  })());

  // Show all options when forced, when empty, or when hostInput exactly matches one (the selected server), so switching is easy.
  let filteredSuggestions = $derived((() => {
    const query = hostInput.trim().toLowerCase();
    if (forceShowAll || !query) {
      return allSuggestions;
    }
    const isExactMatch = allSuggestions.some((s) => s.host.toLowerCase() === query);
    if (isExactMatch) {
      return allSuggestions;
    }
    return allSuggestions.filter((s) => s.host.toLowerCase().includes(query));
  })());

  function updateDropdownPosition() {
    if (!wrapperEl || typeof window === "undefined") {
      return;
    }

    const rect = wrapperEl.getBoundingClientRect();
    const gap = 4;
    const maxHeight = 260;
    const below = window.innerHeight - rect.bottom - gap;
    const above = rect.top - gap;
    const openUp = below < Math.min(maxHeight, 160) && above > below;
    const available = Math.max(120, Math.min(maxHeight, openUp ? above : below));

    const width = Math.min(rect.width, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));

    dropdownStyle = openUp
      ? `position: fixed; left: ${left}px; width: ${width}px; bottom: ${window.innerHeight - rect.top + gap}px; max-height: ${available}px; z-index: var(--z-dropdown, 9999);`
      : `position: fixed; left: ${left}px; width: ${width}px; top: ${rect.bottom + gap}px; max-height: ${available}px; z-index: var(--z-dropdown, 9999);`;
  }

  $effect.pre(() => {
    if (isOpen) {
      untrack(() => updateDropdownPosition());
    }
  });

  onMount(() => {
    if (storageKey) {
      recentList = getRecentValues(storageKey);
    }
  });

  let blurTimeout: any;
  onDestroy(() => {
    if (blurTimeout) clearTimeout(blurTimeout);
  });

  function updateValue(newHost: string) {
    const stripped = stripBackendProtocol(newHost);
    hostInput = stripped;
    const trimmed = stripped.trim();
    const newValue = trimmed ? `${inferBackendProtocol(trimmed)}//${trimmed}` : "";
    lastDispatchedValue = newValue;
    value = newValue;
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    let raw = target.value;
    const stripped = stripBackendProtocol(raw);
    if (stripped !== raw) {
      target.value = stripped;
    }
    forceShowAll = false;
    updateValue(stripped);
    isOpen = true;
    highlightedIndex = -1;
  }

  function openDropdown(showAll: boolean = false) {
    if (disabled) return;
    if (storageKey) {
      recentList = getRecentValues(storageKey);
    }
    forceShowAll = showAll;
    isOpen = true;
    highlightedIndex = -1;
  }

  function closeDropdown() {
    isOpen = false;
    forceShowAll = false;
    highlightedIndex = -1;
  }

  function toggleDropdown() {
    if (disabled) return;
    if (isOpen) {
      closeDropdown();
    } else {
      openDropdown(true);
      inputEl?.focus();
    }
  }

  function selectOption(s: ServerSuggestion) {
    updateValue(s.host);
    closeDropdown();
    commit();
    inputEl?.focus();
  }

  function handleRemove(e: MouseEvent, host: string) {
    e.preventDefault();
    e.stopPropagation();
    if (storageKey) {
      recentList = removeValue(storageKey, host);
    }
  }

  function handleFocus() {
    openDropdown(false);
  }

  function handleBlur() {
    blurTimeout = setTimeout(() => {
      closeDropdown();
      commit();
    }, 150);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      openDropdown(true);
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
        selectOption(filteredSuggestions[highlightedIndex]);
      } else {
        closeDropdown();
      }
    } else if (e.key === "Escape") {
      closeDropdown();
    }
  }

  export function commit() {
    if (storageKey && hostInput.trim()) {
      recentList = recordValue(storageKey, hostInput.trim(), 10);
    }
  }
</script>

<svelte:window
  onresize={() => isOpen && updateDropdownPosition()}
  onscrollcapture={() => isOpen && updateDropdownPosition()}
/>

<div
  bind:this={wrapperEl}
  class="relative flex w-full min-w-0 items-stretch overflow-hidden rounded-md border border-line-strong bg-control transition-colors focus-within:border-accent focus-within:ring-1 focus-within:ring-focus {className}"
>
  <span
    class="inline-flex shrink-0 items-center border-r border-line bg-surface-inset px-2.5 font-mono text-xs font-medium text-muted select-none sm:px-3 sm:text-sm"
    title="Protocol: {protocol}//"
    aria-label="Protocol: {protocol}//"
  >
    {protocol}//
  </span>
  <input
    bind:this={inputEl}
    {id}
    type="text"
    autocomplete="off"
    value={hostInput}
    oninput={handleInput}
    onfocus={handleFocus}
    onblur={handleBlur}
    onkeydown={handleKeydown}
    {placeholder}
    {required}
    {disabled}
    class="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent py-2 pr-2 pl-3 text-base text-content shadow-none outline-none placeholder:text-muted"
    role="combobox"
    aria-expanded={isOpen}
    aria-controls={isOpen ? dropdownId : undefined}
    aria-autocomplete="list"
  />
  <button
    type="button"
    class="flex shrink-0 items-center justify-center px-2.5 text-muted transition-colors hover:text-content focus:outline-none pointer-coarse:min-w-11"
    onmousedown={(e) => {
      e.preventDefault();
      toggleDropdown();
    }}
    tabindex="-1"
    aria-label="Toggle server suggestions"
    {disabled}
  >
    <Icon icon={faChevronDown} class="text-xs transition-transform duration-200 {isOpen ? 'rotate-180' : ''}" />
  </button>
</div>

{#if isOpen && !disabled}
  <ul
    id={dropdownId}
    class="scroll-pane m-0 list-none overflow-y-auto overscroll-contain rounded-md border border-line bg-surface-raised p-1 shadow-md"
    style={dropdownStyle}
    role="listbox"
  >
    {#if filteredSuggestions.length === 0}
      <li class="px-3 py-2 text-center text-xs italic text-muted select-none">
        {$t("exercises.suggestInput.noEntries")}
      </li>
    {:else}
      {#each filteredSuggestions as suggestion, i}
        {@const isCurrent = suggestion.host.toLowerCase() === hostInput.trim().toLowerCase()}
        <li
          role="option"
          aria-selected={i === highlightedIndex || isCurrent}
          class="group flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm transition-colors {i === highlightedIndex ? 'bg-primary text-primary-contrast' : isCurrent ? 'bg-highlight text-accent' : 'text-content hover:bg-surface-inset/60 hover:text-primary-contrast'}"
          onmousedown={(e) => {
            e.preventDefault();
            selectOption(suggestion);
          }}
          onmouseenter={() => (highlightedIndex = i)}
        >
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <span class="truncate font-mono text-xs sm:text-sm">{suggestion.host}</span>
            {#if isCurrent}
              <Icon icon={faCheck} class="shrink-0 text-xs text-accent" label="Selected" />
            {/if}
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <span
              class="px-1.5 py-0.5 rounded-md text-xs font-semibold {suggestion.label === 'Local' ? 'bg-success/20 text-success-fg border border-success/30' : suggestion.label === 'Preview' ? 'bg-warning/20 text-warning-fg border border-warning/30' : suggestion.label === 'Production' ? 'bg-highlight text-accent border border-primary/30' : 'bg-surface-inset/60 text-content border border-line-strong'}"
            >
              {suggestion.label}
            </span>
            {#if suggestion.isCustom}
              <button
                type="button"
                title={$t("exercises.suggestInput.removeEntry")}
                aria-label={$t("exercises.suggestInput.removeEntry")}
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-xs text-muted opacity-60 transition-opacity hover:bg-danger/30 hover:text-danger-fg group-hover:opacity-100"
                onmousedown={(e) => handleRemove(e, suggestion.host)}
              >
                <Icon icon={faXmark} />
              </button>
            {/if}
          </div>
        </li>
      {/each}
    {/if}
  </ul>
{/if}
