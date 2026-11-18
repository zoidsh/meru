import { useLingui } from "@lingui/react/macro";

/**
 * Builds a control's `title`, which the operating system shows as its
 * tooltip: the label, and the shortcut after it in brackets when there is
 * one, the same way on every control.
 */
export const useShortcutTitle = () => {
  const { t } = useLingui();

  return (label: string, shortcut: string | undefined) =>
    shortcut
      ? t({
          message: `${label} (${shortcut})`,
          comment:
            "Tooltip of a control that has a keyboard shortcut: {label} is what the control does, {shortcut} its keys as the platform writes them, such as ⌘R or Ctrl+R",
        })
      : label;
};
