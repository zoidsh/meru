import { beforeAll, describe, expect, mock, test } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";
import type { Messages } from "@lingui/core";
import { formatter } from "@lingui/format-po";
import { compileMessageOrThrow } from "@lingui/message-utils/compileMessage";
import { generateMessageId } from "@lingui/message-utils/generateMessageId";
import { i18n } from "@meru/shared/i18n";
import type { MenuItemConstructorOptions } from "electron";
import type { Labels } from "electron-context-menu";
import {
  gmail,
  built,
  licenseKey,
  mockMenuDependencies,
  PLATFORM_CONTEXTS,
  type PlatformContext,
  setPlatform,
} from "./test/menu-mocks";

/*
 * A label the operating system names, such as an Edit menu's Copy or a
 * dialog's Cancel, takes each platform's own word, which only a message with
 * that platform's context can carry. Each test fails on a label that reaches
 * a platform through a message without its context, so a split is found
 * before a translator meets the shared word.
 */

type ContextMenuOptions = {
  labels: Labels;
  append?: (defaultActions: unknown, parameters: unknown) => MenuItemConstructorOptions[];
};

let contextMenuOptions: ContextMenuOptions | undefined;

mockMenuDependencies();

/*
 * The menu shares a message's link only while Gmail is in the focused window,
 * which the mocks' `getFocusedWindow()` reports as null, so the window is null
 * while a message is open.
 */
const mainWindow = { isVisible: () => true };

const main: { window: typeof mainWindow | null; location: string } = {
  window: mainWindow,
  location: "/",
};

mock.module("@/main", () => ({ main }));

mock.module("electron-context-menu", () => ({
  default: (options: ContextMenuOptions) => {
    contextMenuOptions = options;
  },
}));

const { AppMenu } = await import("./menu");

const { setupWindowContextMenu } = await import("./context-menu");

const { AppTray } = await import("./tray");

const APP_DIR = import.meta.dir;

const SOURCE_CATALOG = path.join(APP_DIR, "../shared/i18n/locales/en.po");

/** Electron roles whose item the operating system names, on every platform that has the role. */
const OS_ROLES = new Set([
  "undo",
  "redo",
  "cut",
  "copy",
  "paste",
  "pasteAndMatchStyle",
  "delete",
  "selectAll",
  "quit",
  "close",
  "minimize",
  "togglefullscreen",
  "help",
  "about",
  "fileMenu",
  "editMenu",
  "viewMenu",
  "windowMenu",
  "appMenu",
]);

/** Roles only macOS has, so only there does the OS name their item. */
const MACOS_OS_ROLES = new Set([
  "hide",
  "hideOthers",
  "unhide",
  "front",
  "window",
  "zoom",
  "services",
  "shareMenu",
  "startSpeaking",
  "stopSpeaking",
  "recentDocuments",
  "clearRecentDocuments",
  "toggleTabBar",
  "selectNextTab",
  "selectPreviousTab",
  "showAllTabs",
  "mergeAllWindows",
  "moveTabToNewWindow",
]);

/** The menu bar's menus every platform names, whatever role they carry. */
const TOP_LEVEL_MENUS = new Set(["File", "Edit", "View", "Window", "Help"]);

/** electron-context-menu's items that do what an Electron role does, keyed as its `labels` are. */
const CONTEXT_MENU_ROLES: (keyof Labels)[] = [
  "cut",
  "copy",
  "paste",
  "pasteAndMatchStyle",
  "selectAll",
  "services",
];

/** Native dialogs' buttons the operating system names, by their English. */
const OS_DIALOG_BUTTONS = new Set(["OK", "Cancel", "Quit", "Close", "Yes", "No"]);

/*
 * Labels left platform-neutral on purpose, each with why, as
 * `<where> <platform> <msgid>`.
 */
const ALLOWED: Record<string, string> = {};

type Message = { msgid: string; context: string | undefined };

const messages: Message[] = [];

/*
 * Every message of the source catalog translates to `⟦<index>⟧`, so a label
 * names the message it came from, context and all.
 */
async function activateMarkedCatalog() {
  const catalog = await formatter({ lineNumbers: false }).parse(
    await Bun.file(SOURCE_CATALOG).text(),
    { locale: "en", sourceLocale: "en", filename: SOURCE_CATALOG },
  );

  const marked: Messages = {};

  for (const [key, entry] of Object.entries(catalog ?? {})) {
    if (entry.obsolete) {
      continue;
    }

    const msgid = entry.message ?? key;

    marked[generateMessageId(msgid, entry.context)] = compileMessageOrThrow(`⟦${messages.length}⟧`);

    messages.push({ msgid, context: entry.context });
  }

  i18n.loadAndActivate({ locale: "en", messages: marked });
}

function messageOf(label: string | undefined) {
  const index = label === undefined ? undefined : /^⟦(\d+)⟧/u.exec(label)?.[1];

  return index === undefined ? undefined : messages[Number(index)];
}

/** Each label that needs the platform's context and lacks it, as `<where> <platform> <msgid>`. */
function missingContexts(
  where: string,
  platform: PlatformContext,
  labels: (string | undefined)[],
): string[] {
  return labels.flatMap((label) => {
    const message = messageOf(label);

    if (message === undefined) {
      return label === undefined ? [] : [`${where} ${platform} untranslated “${label}”`];
    }

    return message.context === platform ? [] : [`${where} ${platform} ${message.msgid}`];
  });
}

function needsContext(
  item: MenuItemConstructorOptions,
  platform: PlatformContext,
  isTopLevel: boolean,
) {
  const role = item.role as string | undefined;

  if (role && (OS_ROLES.has(role) || (platform === "macOS" && MACOS_OS_ROLES.has(role)))) {
    return true;
  }

  const message = messageOf(item.label);

  return isTopLevel && message !== undefined && TOP_LEVEL_MENUS.has(message.msgid);
}

/** The visible items' labels of a template that need the platform's context. */
function osLabels(
  items: MenuItemConstructorOptions[],
  platform: PlatformContext,
  isTopLevel = true,
): (string | undefined)[] {
  return items
    .filter((item) => item.type !== "separator" && item.visible !== false)
    .flatMap((item) => [
      ...(needsContext(item, platform, isTopLevel) ? [item.label] : []),
      ...(Array.isArray(item.submenu) ? osLabels(item.submenu, platform, false) : []),
    ]);
}

/** A licensed Gmail message open, which shows the items that share or copy its link. */
function withLicensedMessage(open: boolean) {
  main.window = open ? null : mainWindow;
  licenseKey.isValid = open;
  gmail.userEmail = open ? "someone@example.com" : undefined;
  gmail.messageId = open ? "1" : undefined;
}

function contextMenuLabels(platform: PlatformContext) {
  withLicensedMessage(true);

  setupWindowContextMenu({} as Parameters<typeof setupWindowContextMenu>[0]);

  const options = contextMenuOptions as ContextMenuOptions;

  const appended = options.append?.({}, { pageURL: "https://mail.google.com/mail/u/0/" }) ?? [];

  withLicensedMessage(false);

  return [...CONTEXT_MENU_ROLES.map((key) => options.labels[key]), ...osLabels(appended, platform)];
}

type DialogButton = { file: string; msgid: string; context: string | undefined };

/*
 * Every literal `t` call inside a `buttons: [...]` array of a dialog in the
 * main process. A button whose label comes from a function, such as
 * `getNativeOkLabel()`, is that function's to word, and the function holds
 * its three messages.
 */
function dialogButtons(file: string, source: string): DialogButton[] {
  const buttons: DialogButton[] = [];

  for (const match of source.matchAll(/\bbuttons:/gu)) {
    const start = (match.index ?? 0) + match[0].length;

    // The property's value runs to the comma or brace that ends it, a ternary's two arrays included.
    let end = start;

    for (let depth = 0; end < source.length; end++) {
      const char = source[end] as string;

      if ("([{".includes(char)) {
        depth++;
      } else if (")]}".includes(char)) {
        depth--;
      }

      if (depth < 0 || (depth === 0 && char === ",")) {
        break;
      }
    }

    const array = source.slice(start, end);

    for (const call of array.matchAll(/\bt`([^`]*)`|\bt\(\{([^}]*)\}\)/gu)) {
      if (call[1] !== undefined) {
        buttons.push({ file, msgid: call[1], context: undefined });

        continue;
      }

      const body = call[2] as string;

      const msgid = /\bmessage:\s*"([^"]*)"/u.exec(body)?.[1];

      if (msgid !== undefined) {
        buttons.push({ file, msgid, context: /\bcontext:\s*"([^"]*)"/u.exec(body)?.[1] });
      }
    }
  }

  return buttons;
}

async function appSources() {
  const files = (await readdir(APP_DIR, { recursive: true })).filter(
    (file) =>
      file.endsWith(".ts") &&
      !file.endsWith(".test.ts") &&
      !file.split(path.sep).includes("node_modules"),
  );

  return Promise.all(
    files.map(async (file) => ({ file, source: await Bun.file(path.join(APP_DIR, file)).text() })),
  );
}

beforeAll(async () => {
  await activateMarkedCatalog();
});

test("finds a dialog's literal buttons, through a ternary too", () => {
  const source = `
    dialog.showMessageBox({
      buttons: [t\`Cancel\`, t({ message: "Quit", context: "macOS" }), getNativeOkLabel()],
      message: t\`Sure?\`,
    });
    dialog.showMessageBox({
      buttons: upgrade ? [t\`Upgrade\`, t\`Cancel\`] : [getNativeOkLabel()],
      detail: t\`Cancel\`,
    });
  `;

  expect(dialogButtons("a.ts", source)).toEqual([
    { file: "a.ts", msgid: "Cancel", context: undefined },
    { file: "a.ts", msgid: "Quit", context: "macOS" },
    { file: "a.ts", msgid: "Upgrade", context: undefined },
    { file: "a.ts", msgid: "Cancel", context: undefined },
  ]);
});

test("every allowance still names a label that lacks its context", () => {
  const found = PLATFORM_CONTEXTS.flatMap((platform) => {
    setPlatform(platform);

    return missingContexts("context menu", platform, contextMenuLabels(platform));
  });

  for (const allowed of Object.keys(ALLOWED)) {
    expect(found).toContain(allowed);
  }
});

test("a native dialog's OS-named button has a platform context", async () => {
  const missing = (await appSources()).flatMap(({ file, source }) =>
    dialogButtons(file, source)
      .filter(
        ({ msgid, context }) =>
          OS_DIALOG_BUTTONS.has(msgid) &&
          !(PLATFORM_CONTEXTS as (string | undefined)[]).includes(context),
      )
      .map(({ msgid }) => `${file}: ${msgid}`),
  );

  expect([...new Set(missing)]).toEqual([]);
});

describe.each(PLATFORM_CONTEXTS)("on %s", (platform) => {
  beforeAll(() => {
    setPlatform(platform);
  });

  test("the application menu's OS labels have the platform's context", () => {
    const missing = [false, true].flatMap((withMessage) => {
      withLicensedMessage(withMessage);

      new AppMenu().createMenu();

      return missingContexts("application menu", platform, osLabels(built.template, platform));
    });

    withLicensedMessage(false);

    expect([...new Set(missing)]).toEqual([]);
  });

  test("the tray menu's OS labels have the platform's context", () => {
    new AppTray().createOrUpdateContextMenu();

    expect(missingContexts("tray menu", platform, osLabels(built.template, platform))).toEqual([]);
  });

  test("the page context menu's OS labels have the platform's context", () => {
    const missing = missingContexts("context menu", platform, contextMenuLabels(platform));

    expect(missing.filter((label) => ALLOWED[label] === undefined)).toEqual([]);
  });
});
