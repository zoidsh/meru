import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";

/** How many checked items a checkbox menu's button names before counting the rest. */
const NAMED = 3;

/**
 * What a checkbox menu's button reads: None, the checked items' names, or
 * the first of them and how many more.
 */
export const useCheckedSummary = (checked: readonly string[]) => {
  const { t, i18n } = useLingui();
  const shownNames = new Intl.ListFormat(i18n.locale, {
    type: "unit",
    style: "short",
  }).format(checked.slice(0, NAMED));
  const more = checked.length - NAMED;

  if (checked.length === 0) {
    return t({
      message: "None",
      comment:
        "What a menu's button in Settings reads while none of its checkboxes is checked, as the Spelling menu with no language or Always open in your default browser with no Google app",
    });
  }

  if (more > 0) {
    return t({
      message: plural(more, {
        one: `${shownNames} and # more`,
        other: `${shownNames} and # more`,
      }),
      comment:
        "What a menu's button in Settings reads with more items checked than it names; {shownNames} lists the first three, as System language, German, French, and # counts the rest",
    });
  }

  return shownNames;
};
