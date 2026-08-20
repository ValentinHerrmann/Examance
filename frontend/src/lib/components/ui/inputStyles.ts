/**
 * The one input recipe, shared by TextInput, Select and any native control that
 * cannot be wrapped (file inputs, textareas inside third-party editors).
 *
 * `text-base` on phones is deliberate: iOS Safari zooms the page whenever a
 * focused field is smaller than 16px.
 */
export const controlClass =
  "w-full min-w-0 box-border rounded-md border border-line bg-surface-base " +
  "px-3 py-2 text-base text-content placeholder:text-subtle sm:text-sm " +
  "focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent " +
  "disabled:cursor-not-allowed disabled:opacity-60";
