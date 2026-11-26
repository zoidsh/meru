/**
 * What the suite's build logs an Electron call it withheld under, which the
 * suite looks for: a test whose app hit one forgot its stand-in.
 */
export const WITHHELD_MARKER = "MERU_E2E_WITHHELD";

/**
 * The button Electron answers a message box's cancel with when the caller
 * names none: the one labelled Cancel or No, else the first.
 */
export const defaultCancelId = (buttons: readonly string[] = []) => {
  const index = buttons.findIndex((label) => /^(?:cancel|no)$/iu.test(label));

  return Math.max(index, 0);
};
