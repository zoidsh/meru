import type { Input, WebContents } from "electron";

import type { KeyListener, Unsubscribe } from "../../core/ports.ts";

/** Hears each key typed into `contents` before its page does, keeping from the page a key `listener` answers true for. */
export const onBeforeInput = (
  contents: WebContents,
  listener: KeyListener
): Unsubscribe => {
  const heard = (event: { preventDefault: () => void }, input: Input) => {
    if (listener(input)) {
      event.preventDefault();
    }
  };
  contents.on("before-input-event", heard);
  return () => {
    contents.off("before-input-event", heard);
  };
};
