import { useLingui } from "@lingui/react/macro";
import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import type { ShellState } from "#contract/shell.ts";
import { FIND_TERM_MAX_LENGTH } from "#core/find.ts";
import { Button } from "#ui/button.tsx";
import { Input } from "#ui/input.tsx";

import { useShortcutTitle } from "./shortcut-title.ts";
import { shellCalls, useShellState } from "./sync.ts";

/**
 * The find bar, filling the overlay's view, which main sizes to it and
 * places at the top right of the page it searches, so a click beside it
 * reaches the page: the field, searched for as it is typed, the count, and
 * Previous, Next and Close. Enter and Shift+Enter step, Escape closes as in
 * every overlay.
 */
export const FindBar = ({
  term: initial,
  ordinal,
  matches,
  opened,
}: Extract<ShellState["overlay"], { kind: "find" }>) => {
  const { t } = useLingui();
  const shortcuts = useShellState("shortcuts");
  const shortcutTitle = useShortcutTitle();
  const field = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState(initial);
  const label = t({
    message: "Find in page",
    comment:
      "Name and placeholder of the field in the small bar over the page that searches the page's text",
  });
  const count = t({
    message: `${ordinal}/${matches}`,
    comment:
      "The find bar's count: {ordinal} is the match shown, {matches} how many the page has, such as 2/14; 0/0 with none",
  });
  const previous = t({
    message: "Previous match",
    comment: "Button in the find bar that shows the match before this one",
  });
  const next = t({
    message: "Next match",
    comment: "Button in the find bar that shows the match after this one",
  });
  const close = t({
    message: "Close",
    comment: "Button in the find bar that ends the search and hides the bar",
  });

  // Stable, so only a new field, as each open makes, is focused.
  const focusAtEnd = useCallback((input: HTMLInputElement | null) => {
    field.current = input;

    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }, []);

  const step = (forward: boolean) => {
    shellCalls().findStep({ forward });
    field.current?.focus();
  };

  return (
    <search
      aria-label={label}
      data-overlay-card
      // No shadow: the view ends at the bar's edge and would cut it off.
      className="fixed inset-0 flex items-center gap-1 rounded-[10px] border border-foreground/10 bg-popover p-1 text-popover-foreground"
    >
      <Input
        // Each open gives the field focus, the caret after its term.
        key={opened}
        ref={focusAtEnd}
        value={term}
        aria-label={label}
        placeholder={label}
        maxLength={FIND_TERM_MAX_LENGTH}
        autoComplete="off"
        spellCheck={false}
        // Not by viewport: this document's is the overlay's own view.
        className="h-8 min-w-0 flex-1 border-0 bg-transparent px-2 text-sm shadow-none select-text focus-visible:ring-0 dark:bg-transparent"
        onChange={(event) => {
          setTerm(event.target.value);
          shellCalls().findInPage({ term: event.target.value });
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            step(!event.shiftKey);
          }
        }}
      />
      <span
        aria-live="polite"
        className="w-12 shrink-0 pr-1 text-right text-xs text-muted-foreground tabular-nums"
      >
        {count}
      </span>
      <div aria-hidden className="h-5 w-px bg-border" />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={previous}
        title={shortcutTitle(previous, shortcuts?.["key:Shift+Enter"])}
        disabled={matches === 0}
        onClick={() => {
          step(false);
        }}
      >
        <ChevronUpIcon aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={next}
        title={shortcutTitle(next, shortcuts?.["key:Enter"])}
        disabled={matches === 0}
        onClick={() => {
          step(true);
        }}
      >
        <ChevronDownIcon aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={close}
        title={shortcutTitle(close, shortcuts?.["key:Escape"])}
        onClick={() => {
          shellCalls().closeOverlay({});
        }}
      >
        <XIcon aria-hidden />
      </Button>
    </search>
  );
};
