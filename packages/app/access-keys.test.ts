import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";
import type { Messages } from "@lingui/core";
import { formatter } from "@lingui/format-po";
import { compileMessageOrThrow } from "@lingui/message-utils/compileMessage";
import { generateMessageId } from "@lingui/message-utils/generateMessageId";
import { i18n } from "@meru/shared/i18n";
import type { MenuItemConstructorOptions } from "electron";
import {
  built,
  gmail,
  gmailView,
  licenseKey,
  mockMenuDependencies,
  type PlatformContext,
  setPlatform,
} from "./test/menu-mocks";

/*
 * Windows and Linux open a menu item by the letter after its `&`, so two items
 * in one menu that share it leave one of them out of reach. Every catalog in
 * the locales directory is checked, so a new language is covered once its file
 * is there. macOS shows no access keys, so only Windows and Linux are built.
 *
 * electron-context-menu runs for real: it decides which of its items a click
 * shows, and only its `process.platform` checks are pointed at the platform.
 */

mockMenuDependencies();

const { AppMenu } = await import("./menu");

const { setupWindowContextMenu } = await import("./context-menu");

const { AppTray } = await import("./tray");

const LOCALES_DIR = path.join(import.meta.dir, "../shared/i18n/locales");

const PLATFORMS: { context: PlatformContext; processPlatform: NodeJS.Platform }[] = [
  { context: "Windows", processPlatform: "win32" },
  { context: "Linux", processPlatform: "linux" },
];

type Menu = { name: string; items: MenuItemConstructorOptions[] };

/** The letter Electron underlines: the one after a single `&`, since `&&` is a literal ampersand. */
function accessKeyOf(label: string) {
  return /&([^&])/u.exec(label.replaceAll("&&", ""))?.[1]?.toLocaleLowerCase();
}

/** Each pair of visible items in one menu, or in one of its submenus, that share an access key. */
function findClashes(menu: Menu): string[] {
  const clashes: string[] = [];

  const byKey = new Map<string, string>();

  const visible = menu.items.filter((item) => item.type !== "separator" && item.visible !== false);

  for (const item of visible) {
    const { label } = item;

    const key = label === undefined ? undefined : accessKeyOf(label);

    if (label === undefined || key === undefined) {
      continue;
    }

    const other = byKey.get(key);

    if (other === undefined) {
      byKey.set(key, label);
    } else {
      clashes.push(`${menu.name}: “${other}” and “${label}” share the access key “${key}”`);
    }
  }

  for (const item of visible) {
    if (Array.isArray(item.submenu)) {
      clashes.push(
        ...findClashes({ name: `${menu.name} > ${item.label ?? item.role}`, items: item.submenu }),
      );
    }
  }

  return clashes;
}

const po = formatter({ lineNumbers: false });

async function loadCatalog(locale: string) {
  const catalogPath = path.join(LOCALES_DIR, `${locale}.po`);

  const catalog = await po.parse(await Bun.file(catalogPath).text(), {
    locale,
    sourceLocale: "en",
    filename: catalogPath,
  });

  const messages: Messages = {};

  for (const [key, entry] of Object.entries(catalog ?? {})) {
    if (entry.obsolete) {
      continue;
    }

    const message = entry.message ?? key;

    messages[generateMessageId(message, entry.context)] = compileMessageOrThrow(
      entry.translation || message,
    );
  }

  return messages;
}

const editFlags = {
  canUndo: true,
  canRedo: true,
  canCut: true,
  canCopy: true,
  canPaste: true,
  canDelete: true,
  canSelectAll: true,
  canEditRichly: true,
};

const NO_CLICK = {
  selectionText: "",
  isEditable: false,
  linkURL: "",
  linkText: "",
  mediaType: "none",
  srcURL: "",
  misspelledWord: "",
  dictionarySuggestions: [] as string[],
  pageURL: gmailView.webContents.getURL(),
  x: 0,
  y: 0,
  editFlags,
};

/** What was right-clicked, each shown by a different set of electron-context-menu's items. */
const CLICKS: Record<string, Partial<typeof NO_CLICK>> = {
  "a page": {},
  "selected text": { selectionText: "Meru" },
  "a text field": { isEditable: true, selectionText: "Meru" },
  "an empty text field": { isEditable: true },
  "a misspelled word": {
    isEditable: true,
    selectionText: "Mreu",
    misspelledWord: "Mreu",
    dictionarySuggestions: ["Meru"],
  },
  "a misspelled word without suggestions": {
    isEditable: true,
    selectionText: "Mreu",
    misspelledWord: "Mreu",
  },
  "a link": { linkURL: "https://example.com/", linkText: "Example" },
  "an email link": { linkURL: "mailto:someone@example.com", linkText: "someone@example.com" },
  "an image": { mediaType: "image", srcURL: "https://example.com/image.png" },
  "a linked image": {
    mediaType: "image",
    srcURL: "https://example.com/image.png",
    linkURL: "https://example.com/",
  },
};

type ContextMenuHandler = (event: unknown, properties: typeof NO_CLICK) => void;

/** The menu a right-click shows, the view itself given, since the menu tells a Gmail view by identity. */
function contextMenuFor(view: { webContents: object }) {
  let handler: ContextMenuHandler | undefined;

  Object.assign(view.webContents, {
    on: (_event: string, listener: ContextMenuHandler) => {
      handler = listener;
    },
    once: () => {},
  });

  setupWindowContextMenu(view as unknown as Parameters<typeof setupWindowContextMenu>[0]);

  return (properties: Partial<typeof NO_CLICK>) => {
    built.template = [];

    handler?.({}, { ...NO_CLICK, ...properties });

    return built.template;
  };
}

function buildMenus(): Menu[] {
  const menus: Menu[] = [];

  new AppMenu().createMenu();

  menus.push({ name: "application menu", items: built.template });

  new AppTray().createOrUpdateContextMenu();

  menus.push({ name: "tray menu", items: built.template });

  const views = {
    "a Gmail view": gmailView,
    "a Gmail message, licensed": gmailView,
    "a Workspace app tab": {
      webContents: { getURL: () => "https://docs.google.com/document/d/1/" },
    },
  };

  for (const [where, view] of Object.entries(views)) {
    const isLicensedMessage = where === "a Gmail message, licensed";

    licenseKey.isValid = isLicensedMessage;
    gmail.userEmail = isLicensedMessage ? "someone@example.com" : undefined;
    gmail.messageId = isLicensedMessage ? "1" : undefined;

    const showFor = contextMenuFor(view);

    for (const [click, properties] of Object.entries(CLICKS)) {
      menus.push({ name: `context menu on ${click} in ${where}`, items: showFor(properties) });
    }
  }

  licenseKey.isValid = false;
  gmail.userEmail = undefined;
  gmail.messageId = undefined;

  return menus;
}

const locales = (await readdir(LOCALES_DIR))
  .filter((file) => file.endsWith(".po"))
  .map((file) => file.slice(0, -".po".length));

const processPlatform = process.platform;

function setProcessPlatform(value: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

afterAll(() => {
  setProcessPlatform(processPlatform);
});

test("finds two items that share an access key, in a submenu too", () => {
  const items: MenuItemConstructorOptions[] = [
    { label: "&Paste" },
    { label: "&Paste And Match Style" },
    { label: "Fish && &Chips" },
    { label: "&Chips", visible: false },
    { type: "separator" },
    { label: "&View", submenu: [{ label: "&Zoom" }, { label: "&zoom Out" }] },
  ];

  expect(findClashes({ name: "menu", items })).toEqual([
    "menu: “&Paste” and “&Paste And Match Style” share the access key “p”",
    "menu > &View: “&Zoom” and “&zoom Out” share the access key “z”",
  ]);
});

describe.each(locales)("%s", (locale) => {
  describe.each(PLATFORMS)("on $context", ({ context, processPlatform: platformName }) => {
    let menus: Menu[] = [];

    beforeAll(async () => {
      i18n.loadAndActivate({ locale, messages: await loadCatalog(locale) });

      setPlatform(context);

      setProcessPlatform(platformName);

      menus = buildMenus();
    });

    test("no two items in one menu share an access key", () => {
      expect(menus.length).toBeGreaterThan(0);

      const clashes = menus.flatMap((menu) =>
        findClashes(menu).map((clash) => `${locale}, ${context}, ${clash}`),
      );

      expect(clashes).toEqual([]);
    });
  });
});
