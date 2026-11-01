import { describe, expect, test } from "bun:test";
import { parse } from "../.claude/skills/translate/collect";
import {
  formatSharedMessages,
  menuSharedMessages,
  sharedMessages,
} from "../.claude/skills/translate/shared-messages";

const CATALOG = `msgid ""
msgstr ""
"Language: en\\n"

#. Option of the Theme setting
#. Option of the system tray icon's Color setting
#: packages/renderer/routes/settings/appearance.tsx
msgid "Light"
msgstr "Light"

#. Button in the download history
#: packages/renderer/components/download-history.tsx
#: packages/renderer/routes/settings/notifications.tsx
msgid "Show in folder"
msgstr "Show in folder"

#. Option of the Width setting
#. Option of the Placement setting
#: packages/shared/tabs.ts
#: packages/renderer/routes/settings/appearance.tsx
msgctxt "width"
msgid "Auto"
msgstr "Auto"

#. Button that saves
#: packages/renderer/a.tsx
#: packages/renderer/a.tsx
msgid "Save"
msgstr "Save"

#~ msgid "Gone"
#~ msgstr "Gone"
`;

describe("shared-messages.ts", () => {
  test("lists a msgid without a context that two comments describe, never one two files share under one", async () => {
    const messages = sharedMessages("app", await parse(CATALOG, "en", "en", "en.po"));

    expect(messages).toEqual([
      {
        catalog: "app",
        msgid: "Light",
        comments: ["Option of the Theme setting", "Option of the system tray icon's Color setting"],
        references: ["packages/renderer/routes/settings/appearance.tsx"],
      },
    ]);

    expect(formatSharedMessages(messages)).toEqual([
      'app "Light"',
      "  #. Option of the Theme setting",
      "  #. Option of the system tray icon's Color setting",
      "  #: packages/renderer/routes/settings/appearance.tsx",
    ]);
  });

  test("--menus lists a msgid the menu bar and a popup menu both use, even under one comment", async () => {
    const catalog = await parse(
      `msgid ""
msgstr ""
"Language: en\\n"

#. A menu or a menu item in Meru's menu bar
#: packages/app/ipc.ts
#: packages/app/menu.ts
msgid "Reopen Closed Tab"
msgstr "Reopen Closed Tab"

#. A menu or a menu item in Meru's menu bar
#: packages/app/menu.ts
msgid "Zoom In"
msgstr "Zoom In"

#: packages/app/context-menu.ts
#: packages/app/menu.ts
msgctxt "macOS"
msgid "Cut"
msgstr "Cut"
`,
      "en",
      "en",
      "en.po",
    );

    expect(menuSharedMessages("app", catalog).map(({ msgid }) => msgid)).toEqual([
      "Reopen Closed Tab",
    ]);
  });
});
