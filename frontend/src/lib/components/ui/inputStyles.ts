/** The one input recipe for TextInput, Select, Textarea and unwrappable native controls. `text-base` is deliberate: iOS Safari zooms on focused fields under 16px; compact controls use `controlSmClass`. */
export const controlClass =
  "w-full min-w-0 rounded-md border border-line-strong bg-control px-3 py-2 text-base text-content shadow-xs placeholder:text-muted hover:border-line-hover focus:border-focus focus:outline-none disabled:cursor-not-allowed disabled:bg-disabled disabled:opacity-70 aria-invalid:border-danger";

/** Compact variant (`size="sm"`): dense desktop toolbars and table cells. */
export const controlSmClass = "px-2.5 py-1.5 text-sm";

/** Dense form variant (`Field compact`): small from `sm` on, 16px on phones so iOS does not zoom; `!` because `controlClass`'s padding comes later in the CSS. */
export const controlCompactClass = "px-2.5! py-1.5! sm:text-sm";
