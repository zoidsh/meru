import { useState } from "react";
import type { z } from "zod";

import { useDebounced } from "../../use-debounced.ts";

// Typing writes once it pauses rather than on every key, so a half-typed value never reaches main and the titlebar does not follow every key.
const TYPING = 400;

/** Text typed into an input, written once typing pauses while the schema takes what `parse` reads from it, written at once when the input loses focus, and then put back to the value in force. */
export const useDraft = <S extends z.ZodType>(
  value: string,
  parse: (text: string) => unknown,
  schema: S,
  onChange: (value: z.output<S>) => void
) => {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const write = useDebounced(onChange, TYPING);
  const shown = draft ?? value;
  const valid = schema.safeParse(parse(shown)).success;
  return {
    handleBlur: () => {
      write.flush();
      setDraft(undefined);
    },
    handleChange: (text: string) => {
      setDraft(text);
      const parsed = schema.safeParse(parse(text));
      if (parsed.success) {
        write.call(parsed.data);
      }
    },
    shown,
    valid,
  };
};
