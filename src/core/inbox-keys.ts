import type { MailAction } from "./mail-actions.ts";

/** What a key pressed on a row of the unified inbox does. */
export type InboxKeyCommand =
  | { kind: "action"; action: MailAction }
  | { kind: "move"; to: "next" | "previous" | "first" | "last" }
  | { kind: "open" };

/** Gmail's letter keys, by the letter and whether Shift is held. */
const LETTERS: Record<string, InboxKeyCommand> = {
  e: { kind: "action", action: "archive" },
  "shift+i": { kind: "action", action: "markAsRead" },
  j: { kind: "move", to: "next" },
  k: { kind: "move", to: "previous" },
  o: { kind: "open" },
};

/** Keys that Caps Lock never changes. */
const OTHERS: Record<string, InboxKeyCommand> = {
  "#": { kind: "action", action: "delete" },
  "!": { kind: "action", action: "markAsSpam" },
  ArrowDown: { kind: "move", to: "next" },
  ArrowUp: { kind: "move", to: "previous" },
  Home: { kind: "move", to: "first" },
  End: { kind: "move", to: "last" },
  Enter: { kind: "open" },
};

/**
 * The command for a key pressed on a row, if any. A letter is read
 * lower-cased with Shift's state, so Caps Lock changes nothing: `e` with it
 * on still archives, and `I` without Shift marks nothing read.
 */
export const inboxKeyCommand = ({
  key,
  shiftKey,
}: {
  key: string;
  shiftKey: boolean;
}): InboxKeyCommand | undefined => {
  if (/^\p{L}$/u.test(key)) {
    const letter = key.toLowerCase();

    return LETTERS[shiftKey ? `shift+${letter}` : letter];
  }

  return Object.hasOwn(OTHERS, key) ? OTHERS[key] : undefined;
};
