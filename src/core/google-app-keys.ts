import { once } from "es-toolkit";

import { acceleratorIdentity } from "./accelerator.ts";
import type { Platform } from "./platform.ts";

/**
 * The keys each Google app's published shortcut list gives, as Electron
 * accelerators separated by spaces, on macOS and in Google's PC column,
 * which Windows and Linux share. Only keys held with Command, Control or
 * Alt, or a function key, since no Meru shortcut can be anything else; a
 * chord's first key counts as taken. Best-effort: Meet's and Contacts'
 * lists hold only part of their keys.
 */
const KEYS_BY_APP: Readonly<Record<string, { mac: string; pc: string }>> = {
  Gmail: {
    mac: String.raw`
      Alt+Command+, Alt+Command+. Command+; Command+B Command+Enter
      Command+I Command+K Command+M Command+U Command+[ Command+\ Command+]
      Control+, Control+. Shift+Command+- Shift+Command+5 Shift+Command+6
      Shift+Command+7 Shift+Command+8 Shift+Command+9 Shift+Command+B
      Shift+Command+C Shift+Command+E Shift+Command+F Shift+Command+L
      Shift+Command+Plus Shift+Command+R
    `,
    pc: String.raw`
      Control+, Control+. Control+Alt+, Control+Alt+. Control+B
      Control+Enter Control+I Control+K Control+M Control+Shift+-
      Control+Shift+5 Control+Shift+6 Control+Shift+7 Control+Shift+8
      Control+Shift+9 Control+Shift+B Control+Shift+C Control+Shift+E
      Control+Shift+F Control+Shift+L Control+Shift+Plus Control+Shift+R
      Control+U Control+[ Control+\ Control+]
    `,
  },
  Calendar: {
    mac: String.raw`
      Command+S
    `,
    pc: String.raw`
      Control+S
    `,
  },
  Drive: {
    mac: String.raw`
      Alt+Command+A Alt+Command+L Alt+Command+M Alt+Command+P Alt+Command+R
      Alt+Command+S Alt+G Alt+V Command+/ Command+A Command+Down
      Command+Enter Command+F Command+Left Command+P Command+Right
      Command+Up Command+X Command+Y Command+Z Control+A Control+C
      Control+Command+R Control+N Control+R Control+Shift+A Control+T F2
      Shift+Command+C Shift+Command+S Shift+Command+V Shift+F10
    `,
    pc: String.raw`
      Alt+A Alt+C Alt+G Alt+N Alt+R Alt+Shift+A Alt+T Alt+V Control+/
      Control+A Control+Alt+A Control+Alt+L Control+Alt+M Control+Alt+P
      Control+Alt+R Control+Alt+S Control+Down Control+Enter Control+F
      Control+Left Control+P Control+Right Control+Shift+C Control+Shift+S
      Control+Shift+V Control+Up Control+X Control+Y Control+Z F2 Shift+F10
    `,
  },
  Docs: {
    mac: String.raw`
      Alt+/ Alt+Command+, Alt+Command+. Alt+Command+0 Alt+Command+1
      Alt+Command+2 Alt+Command+3 Alt+Command+4 Alt+Command+5 Alt+Command+6
      Alt+Command+C Alt+Command+Enter Alt+Command+F Alt+Command+H
      Alt+Command+M Alt+Command+V Alt+Command+X Alt+Command+Y Alt+Command+Z
      Alt+Enter Alt+Left Alt+Right Alt+Shift+Command+A Alt+Shift+Command+C
      Alt+Shift+Command+H Alt+Shift+Command+I Alt+Shift+Command+K
      Alt+Shift+Command+M Alt+Shift+Command+R Alt+Shift+Command+X
      Alt+Shift+Command+Z Alt+Shift+Down Alt+Shift+K Alt+Shift+Left
      Alt+Shift+Right Alt+Shift+Up Command+' Command+, Command+- Command+.
      Command+/ Command+0 Command+; Command+A Command+B Command+C
      Command+Down Command+Enter Command+Escape Command+F Command+G
      Command+I Command+K Command+O Command+P Command+Plus Command+S
      Command+U Command+V Command+X Command+Y Command+Z Command+[ Command+\
      Command+] Control+Alt+A Control+Alt+E Control+Alt+F Control+Alt+H
      Control+Alt+I Control+Alt+O Control+Alt+T Control+Alt+V Control+Alt+Z
      Control+Command+A Control+Command+B Control+Command+E
      Control+Command+I Control+Command+J Control+Command+K
      Control+Command+N Control+Command+O Control+Command+P
      Control+Command+Q Control+Command+U Control+Command+W
      Control+Shift+Command+E Control+Shift+Command+Left
      Control+Shift+Command+N Control+Shift+Command+P
      Control+Shift+Command+Right Control+Shift+Command+T Control+Shift+Down
      Control+Shift+F Control+Shift+Up F7 Shift+Command+, Shift+Command+.
      Shift+Command+7 Shift+Command+8 Shift+Command+9 Shift+Command+C
      Shift+Command+Down Shift+Command+E Shift+Command+G Shift+Command+H
      Shift+Command+J Shift+Command+K Shift+Command+L Shift+Command+R
      Shift+Command+S Shift+Command+Up Shift+Command+V Shift+Command+X
      Shift+Command+Y Shift+Command+Z Shift+Command+\ Shift+F10
    `,
    pc: String.raw`
      Alt+/ Alt+A Alt+E Alt+Enter Alt+F Alt+H Alt+I Alt+Left Alt+O Alt+Right
      Alt+Shift+5 Alt+Shift+A Alt+Shift+E Alt+Shift+F Alt+Shift+H
      Alt+Shift+I Alt+Shift+Left Alt+Shift+O Alt+Shift+Right Alt+Shift+T
      Alt+Shift+V Alt+Shift+Z Alt+Shift+~ Alt+T Alt+V Alt+Z Control+'
      Control+, Control+- Control+. Control+/ Control+0 Control+; Control+A
      Control+Alt+, Control+Alt+. Control+Alt+0 Control+Alt+1 Control+Alt+2
      Control+Alt+3 Control+Alt+4 Control+Alt+5 Control+Alt+6 Control+Alt+A
      Control+Alt+B Control+Alt+C Control+Alt+E Control+Alt+Enter
      Control+Alt+F Control+Alt+H Control+Alt+I Control+Alt+J Control+Alt+K
      Control+Alt+M Control+Alt+N Control+Alt+O Control+Alt+P Control+Alt+Q
      Control+Alt+Shift+A Control+Alt+Shift+C Control+Alt+Shift+E
      Control+Alt+Shift+H Control+Alt+Shift+I Control+Alt+Shift+K
      Control+Alt+Shift+Left Control+Alt+Shift+M Control+Alt+Shift+N
      Control+Alt+Shift+P Control+Alt+Shift+R Control+Alt+Shift+Right
      Control+Alt+Shift+T Control+Alt+Shift+X Control+Alt+Shift+Z
      Control+Alt+U Control+Alt+V Control+Alt+W Control+Alt+X Control+Alt+Y
      Control+Alt+Z Control+B Control+C Control+Enter Control+F Control+G
      Control+H Control+I Control+K Control+O Control+P Control+Plus
      Control+S Control+Shift+, Control+Shift+. Control+Shift+7
      Control+Shift+8 Control+Shift+9 Control+Shift+C Control+Shift+Down
      Control+Shift+E Control+Shift+End Control+Shift+F Control+Shift+G
      Control+Shift+Home Control+Shift+J Control+Shift+K Control+Shift+L
      Control+Shift+Left Control+Shift+PageDown Control+Shift+PageUp
      Control+Shift+R Control+Shift+Right Control+Shift+S Control+Shift+Up
      Control+Shift+V Control+Shift+X Control+Shift+Y Control+Shift+Z
      Control+Shift+\ Control+Space Control+U Control+V Control+X Control+Y
      Control+Z Control+[ Control+\ Control+] F7 Shift+F10
    `,
  },
  Sheets: {
    mac: String.raw`
      Alt+/ Alt+Command+, Alt+Command+- Alt+Command+. Alt+Command+0
      Alt+Command+9 Alt+Command+= Alt+Command+H Alt+Command+M Alt+Command+R
      Alt+Command+T Alt+Command+Z Alt+Command+\ Alt+Down Alt+Enter Alt+Left
      Alt+Right Alt+Shift+1 Alt+Shift+2 Alt+Shift+3 Alt+Shift+4 Alt+Shift+6
      Alt+Shift+7 Alt+Shift+Command+; Alt+Shift+Command+A
      Alt+Shift+Command+C Alt+Shift+Command+H Alt+Shift+Command+I
      Alt+Shift+Command+K Alt+Shift+Command+R Alt+Shift+Down Alt+Shift+K
      Alt+Shift+Left Alt+Shift+Q Alt+Shift+Right Alt+Shift+S Alt+Shift+Up
      Alt+Up Command+/ Command+2 Command+3 Command+4 Command+5 Command+;
      Command+A Command+B Command+Backspace Command+C Command+D Command+E
      Command+Enter Command+Escape Command+F Command+I Command+K
      Command+Left Command+O Command+P Command+R Command+Right Command+S
      Command+U Command+V Command+X Command+Y Command+Z Command+\ Control+2
      Control+3 Control+4 Control+5 Control+Alt+A Control+Alt+D
      Control+Alt+Down Control+Alt+E Control+Alt+F Control+Alt+H
      Control+Alt+I Control+Alt+M Control+Alt+N Control+Alt+O Control+Alt+T
      Control+Alt+Up Control+Alt+V Control+Command+E Control+Command+N
      Control+Command+P Control+Command+R Control+E Control+F Control+G
      Control+Shift+* Control+Shift+1 Control+Shift+2 Control+Shift+3
      Control+Shift+4 Control+Shift+5 Control+Shift+6 Control+Shift+7
      Control+Shift+Command+M Control+Shift+F Control+Space Control+~ F1 F2
      F4 F9 Shift+Command+* Shift+Command+0 Shift+Command+7 Shift+Command+9
      Shift+Command+; Shift+Command+E Shift+Command+Enter Shift+Command+H
      Shift+Command+K Shift+Command+L Shift+Command+R Shift+Command+Space
      Shift+Command+V Shift+Command+X Shift+Command+Z Shift+Command+\
      Shift+F1 Shift+F10 Shift+F11 Shift+F2
    `,
    pc: String.raw`
      Alt+/ Alt+1 Alt+A Alt+D Alt+Down Alt+E Alt+Enter Alt+F Alt+H Alt+I
      Alt+M Alt+N Alt+O Alt+Shift+1 Alt+Shift+2 Alt+Shift+3 Alt+Shift+4
      Alt+Shift+5 Alt+Shift+6 Alt+Shift+7 Alt+Shift+A Alt+Shift+D
      Alt+Shift+Down Alt+Shift+E Alt+Shift+F Alt+Shift+H Alt+Shift+I
      Alt+Shift+K Alt+Shift+Left Alt+Shift+M Alt+Shift+N Alt+Shift+O
      Alt+Shift+Q Alt+Shift+Right Alt+Shift+S Alt+Shift+T Alt+Shift+Up
      Alt+Shift+V Alt+T Alt+Up Alt+V Control+/ Control+; Control+A
      Control+Alt+, Control+Alt+- Control+Alt+. Control+Alt+0 Control+Alt+9
      Control+Alt+= Control+Alt+E Control+Alt+H Control+Alt+M Control+Alt+N
      Control+Alt+P Control+Alt+R Control+Alt+Shift+; Control+Alt+Shift+A
      Control+Alt+Shift+C Control+Alt+Shift+H Control+Alt+Shift+I
      Control+Alt+Shift+K Control+Alt+Shift+M Control+Alt+Shift+R
      Control+Alt+T Control+Alt+Z Control+Alt+\ Control+B Control+Backspace
      Control+C Control+D Control+Down Control+E Control+End Control+Enter
      Control+F Control+H Control+Home Control+I Control+K Control+O
      Control+P Control+R Control+S Control+Shift+0 Control+Shift+1
      Control+Shift+2 Control+Shift+3 Control+Shift+4 Control+Shift+5
      Control+Shift+6 Control+Shift+7 Control+Shift+9 Control+Shift+;
      Control+Shift+E Control+Shift+Enter Control+Shift+F Control+Shift+K
      Control+Shift+L Control+Shift+R Control+Shift+Space Control+Shift+V
      Control+Shift+Z Control+Shift+\ Control+Space Control+U Control+Up
      Control+V Control+X Control+Y Control+Z Control+\ Control+~ F1 F2 F4
      F9 Shift+F1 Shift+F10 Shift+F11 Shift+F2
    `,
  },
  Slides: {
    mac: String.raw`
      Alt+/ Alt+Command+, Alt+Command+. Alt+Command+C Alt+Command+G
      Alt+Command+H Alt+Command+M Alt+Command+V Alt+Command+Y Alt+Command+Z
      Alt+Enter Alt+Left Alt+Right Alt+Shift+Command+A Alt+Shift+Command+B
      Alt+Shift+Command+C Alt+Shift+Command+F Alt+Shift+Command+G
      Alt+Shift+Command+H Alt+Shift+Command+I Alt+Shift+Command+J
      Alt+Shift+Command+K Alt+Shift+Command+P Alt+Shift+Command+S
      Alt+Shift+Down Alt+Shift+Left Alt+Shift+Right Alt+Shift+Up Command+'
      Command+, Command+- Command+. Command+/ Command+0 Command+; Command+A
      Command+B Command+C Command+D Command+Down Command+Enter Command+F
      Command+G Command+I Command+K Command+O Command+P Command+Plus
      Command+S Command+U Command+Up Command+V Command+X Command+Y Command+Z
      Command+[ Command+\ Command+] Control+Alt+E Control+Alt+F
      Control+Alt+H Control+Alt+I Control+Alt+O Control+Alt+R Control+Alt+S
      Control+Alt+T Control+Alt+V Control+Alt+Z Control+Command+A
      Control+Command+B Control+Command+E Control+Command+I
      Control+Command+J Control+Command+K Control+Command+N
      Control+Command+P Control+Command+R Control+Command+U
      Control+Command+W Control+Command+X Control+Enter Control+M
      Control+Shift+Command+E Control+Shift+F Shift+Command+,
      Shift+Command+. Shift+Command+7 Shift+Command+8 Shift+Command+<
      Shift+Command+> Shift+Command+C Shift+Command+Down Shift+Command+E
      Shift+Command+Enter Shift+Command+F Shift+Command+G Shift+Command+H
      Shift+Command+J Shift+Command+K Shift+Command+L Shift+Command+R
      Shift+Command+Up Shift+Command+X Shift+Command+Y Shift+Command+Z
      Shift+Command+\ Shift+F10
    `,
    pc: String.raw`
      Alt+/ Alt+A Alt+E Alt+Enter Alt+F Alt+H Alt+I Alt+Left Alt+O Alt+Right
      Alt+Shift+5 Alt+Shift+A Alt+Shift+Down Alt+Shift+E Alt+Shift+F
      Alt+Shift+H Alt+Shift+I Alt+Shift+Left Alt+Shift+O Alt+Shift+Right
      Alt+Shift+T Alt+Shift+Up Alt+Shift+V Alt+Shift+~ Alt+T Alt+V Alt+Z
      Control+' Control+, Control+- Control+. Control+/ Control+0 Control+;
      Control+A Control+Alt+, Control+Alt+. Control+Alt+9 Control+Alt+A
      Control+Alt+B Control+Alt+C Control+Alt+E Control+Alt+G Control+Alt+H
      Control+Alt+I Control+Alt+J Control+Alt+K Control+Alt+M Control+Alt+N
      Control+Alt+P Control+Alt+R Control+Alt+Shift+A Control+Alt+Shift+B
      Control+Alt+Shift+C Control+Alt+Shift+E Control+Alt+Shift+F
      Control+Alt+Shift+G Control+Alt+Shift+H Control+Alt+Shift+I
      Control+Alt+Shift+J Control+Alt+Shift+K Control+Alt+Shift+P
      Control+Alt+Shift+S Control+Alt+U Control+Alt+V Control+Alt+W
      Control+Alt+X Control+Alt+Y Control+Alt+Z Control+B Control+C
      Control+D Control+Down Control+Enter Control+F Control+F5 Control+G
      Control+H Control+I Control+K Control+M Control+O Control+P
      Control+Plus Control+S Control+Shift+, Control+Shift+. Control+Shift+7
      Control+Shift+8 Control+Shift+< Control+Shift+> Control+Shift+C
      Control+Shift+Down Control+Shift+E Control+Shift+F Control+Shift+G
      Control+Shift+J Control+Shift+K Control+Shift+L Control+Shift+R
      Control+Shift+Up Control+Shift+X Control+Shift+Y Control+Shift+Z
      Control+Shift+\ Control+Space Control+U Control+Up Control+V Control+X
      Control+Y Control+Z Control+[ Control+\ Control+] F11 Shift+F10
    `,
  },
  Meet: {
    mac: String.raw`
      Command+D Command+E Control+Command+C Control+Command+H
      Control+Command+I Control+Command+J Control+Command+K
      Control+Command+M Control+Command+P Control+Command+S
      Control+Command+T
    `,
    pc: String.raw`
      Control+Alt+C Control+Alt+H Control+Alt+I Control+Alt+J Control+Alt+K
      Control+Alt+M Control+Alt+P Control+Alt+S Control+Alt+T Control+D
      Control+E
    `,
  },
  Chat: {
    mac: String.raw`
      Alt+0 Alt+1 Alt+2 Alt+3 Alt+4 Alt+5 Alt+6 Alt+7 Alt+8 Alt+9
      Alt+Command+, Alt+Command+. Command+, Command+. Command+Down Command+G
      Command+I Command+J Command+O Command+S Command+Up Shift+Command+K
    `,
    pc: String.raw`
      Alt+0 Alt+1 Alt+2 Alt+3 Alt+4 Alt+5 Alt+6 Alt+7 Alt+8 Alt+9 Control+,
      Control+. Control+Alt+, Control+Alt+. Control+Down Control+G Control+I
      Control+J Control+O Control+S Control+Shift+K Control+Up
    `,
  },
  Keep: {
    mac: String.raw`
      Command+A Command+Enter Command+G Command+[ Command+] Shift+Command+8
    `,
    pc: String.raw`
      Control+A Control+Enter Control+G Control+Shift+8 Control+[ Control+]
    `,
  },
  Tasks: {
    mac: String.raw`
      Alt+Command+Enter Alt+Down Alt+Up Command+/ Command+Down Command+P
      Command+Up Command+Z Command+[ Command+] Shift+Command+Down
      Shift+Command+Up
    `,
    pc: String.raw`
      Control+/ Control+Alt+Enter Control+Down Control+P Control+Shift+Down
      Control+Shift+Up Control+Up Control+Z Control+[ Control+]
    `,
  },
  Contacts: {
    mac: String.raw`
      Command+Enter
    `,
    pc: String.raw`
      Control+Enter
    `,
  },
};

/**
 * A US key's character with Shift, by the key's own: Google's lists name
 * either (`⌘ + Shift + <`, `⌘ + Shift + ,`), and Meru names a key by one.
 */
const SHIFTED: Readonly<Record<string, string>> = {
  "`": "~",
  "1": "!",
  "2": "@",
  "3": "#",
  "4": "$",
  "5": "%",
  "6": "^",
  "7": "&",
  "8": "*",
  "9": "(",
  "0": ")",
  "-": "_",
  "=": "Plus",
  "[": "{",
  "]": "}",
  "\\": "|",
  ";": ":",
  "'": '"',
  ",": "<",
  ".": ">",
  "/": "?",
};

const UNSHIFTED = Object.fromEntries(
  Object.entries(SHIFTED).map(([key, shifted]) => [shifted, key])
);

/**
 * The accelerators that press the same keys as `accelerator` does on a US
 * layout: Plus is `=` with Shift, which a key event names `=`, and
 * zooming hears without Shift too.
 */
const pressedAs = (accelerator: string) => {
  const parts = accelerator.split("+");
  const key = parts.pop() ?? "";
  const modifiers = parts.filter((part) => part !== "Shift");
  const shifted = parts.includes("Shift");
  const join = (withShift: boolean, each: string) =>
    [...modifiers, ...(withShift ? ["Shift"] : []), each].join("+");
  const base = UNSHIFTED[key];
  const variants = [accelerator];

  if (base !== undefined) {
    variants.push(join(true, base));
  }

  if (shifted && SHIFTED[key] !== undefined) {
    variants.push(join(true, SHIFTED[key]));
  }

  if (key === "Plus" && !shifted) {
    variants.push(join(false, "="));
  }

  return variants;
};

const byKey = (on: "mac" | "pc") => {
  const isMacOS = on === "mac";
  const keys = new Map<string, string[]>();

  for (const [app, list] of Object.entries(KEYS_BY_APP)) {
    for (const accelerator of list[on].split(/\s+/u).filter(Boolean)) {
      for (const each of pressedAs(accelerator)) {
        const identity = acceleratorIdentity(each, isMacOS) ?? "";
        const apps = keys.get(identity) ?? [];

        if (!apps.includes(app)) {
          keys.set(identity, [...apps, app]);
        }
      }
    }
  }

  return keys;
};

const lists = once(() => ({ mac: byKey("mac"), pc: byKey("pc") }));

/** The Google apps that use `accelerator` on `platform`, in the list's order. */
export const googleAppsUsing = (
  accelerator: string,
  platform: Platform
): readonly string[] => {
  const isMacOS = platform === "darwin";
  const identity = acceleratorIdentity(accelerator, isMacOS);

  return identity === undefined
    ? []
    : (lists()[isMacOS ? "mac" : "pc"].get(identity) ?? []);
};
