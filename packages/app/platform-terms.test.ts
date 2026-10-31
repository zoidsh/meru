import { beforeAll, describe, expect, mock, test } from "bun:test";
import { compileMessageOrThrow } from "@lingui/message-utils/compileMessage";
import { generateMessageId } from "@lingui/message-utils/generateMessageId";
import { i18n } from "@meru/shared/i18n";
import type { MenuItemConstructorOptions } from "electron";
import type { Labels } from "electron-context-menu";
import {
  built,
  mockMenuDependencies,
  PLATFORM_CONTEXTS,
  type PlatformContext,
  setPlatform,
} from "./test/menu-mocks";

let contextMenuLabels: Labels = {};

mockMenuDependencies();

mock.module("electron-context-menu", () => ({
  default: (options: { labels: Labels }) => {
    contextMenuLabels = options.labels;
  },
}));

const { AppMenu } = await import("./menu");

const { setupWindowContextMenu } = await import("./context-menu");

const { AppTray } = await import("./tray");

/** The menu's labels each platform words its own way, as each one shows them. */
const MENU_MESSAGES = [
  "About {appName}",
  "Check for Updates…",
  "Settings",
  "File",
  "Compose",
  "Undo",
  "Redo",
  "Cut",
  "Paste",
  "Paste and Match Style",
  "Select All",
  "View",
  "Quit {appName}",
];

const CONTEXT_MENU_MESSAGES: Partial<Record<keyof Labels, string>> = {
  cut: "Cu&t",
  paste: "&Paste",
  pasteAndMatchStyle: "Paste and &Match Style",
  saveImageAs: "Sa&ve Image As…",
};

/** An OS label only macOS shows, which takes Apple's word through the macOS message alone. */
const MACOS_ONLY_MENU_MESSAGE = "Window";

/** macOS never shows electron-context-menu's Select All. */
const NON_MACOS_CONTEXT_MENU_MESSAGES: Partial<Record<keyof Labels, string>> = {
  selectAll: "Select &All",
};

/** The tray's Quit: the menu's message on macOS, and Windows' Exit and Linux's Quit, each in its own English. */
const TRAY_QUIT_MESSAGES: Record<PlatformContext, string> = {
  macOS: "Quit {appName}",
  Windows: "Exit",
  Linux: "Quit",
};

function markedTranslation(context: PlatformContext, message: string) {
  return `[${context}] ${message}`;
}

/** Translates every platform's message with the platform's name in front, so a label shows which one it came from. */
function activatePlatformMarkedCatalog() {
  const messages = [
    ...MENU_MESSAGES,
    MACOS_ONLY_MENU_MESSAGE,
    ...Object.values(TRAY_QUIT_MESSAGES),
    ...Object.values(CONTEXT_MENU_MESSAGES),
    ...Object.values(NON_MACOS_CONTEXT_MENU_MESSAGES),
  ].filter((message) => message !== undefined);

  i18n.loadAndActivate({
    locale: "en",
    messages: Object.fromEntries(
      messages.flatMap((message) =>
        PLATFORM_CONTEXTS.map((context) => [
          generateMessageId(message, context),
          compileMessageOrThrow(markedTranslation(context, message)),
        ]),
      ),
    ),
  });
}

function collectLabels(items: MenuItemConstructorOptions[]): string[] {
  return items.flatMap((item) => [
    ...(item.label === undefined ? [] : [item.label]),
    ...(Array.isArray(item.submenu) ? collectLabels(item.submenu) : []),
  ]);
}

describe.each(PLATFORM_CONTEXTS)("on %s", (context) => {
  beforeAll(() => {
    activatePlatformMarkedCatalog();

    setPlatform(context);
  });

  test("the application menu uses the platform's message for each OS label", () => {
    new AppMenu().createMenu();

    const labels = collectLabels(built.template);

    for (const message of MENU_MESSAGES) {
      expect(labels).toContain(markedTranslation(context, message.replace("{appName}", "Meru")));
    }

    const otherContexts = PLATFORM_CONTEXTS.filter((otherContext) => otherContext !== context);

    for (const label of labels) {
      for (const otherContext of otherContexts) {
        expect(label).not.toStartWith(`[${otherContext}]`);
      }
    }
  });

  test("a menu only macOS shows takes the macOS message", () => {
    new AppMenu().createMenu();

    const labels = collectLabels(built.template);

    if (context === "macOS") {
      expect(labels).toContain(markedTranslation("macOS", MACOS_ONLY_MENU_MESSAGE));
    } else {
      expect(labels).not.toContain(markedTranslation("macOS", MACOS_ONLY_MENU_MESSAGE));
    }
  });

  test("the tray's Quit is the platform's message, with its English unchanged", () => {
    new AppTray().createOrUpdateContextMenu();

    const labels = collectLabels(built.template);

    for (const quitContext of PLATFORM_CONTEXTS) {
      const quit = markedTranslation(
        quitContext,
        TRAY_QUIT_MESSAGES[quitContext].replace("{appName}", "Meru"),
      );

      if (quitContext === context) {
        expect(labels).toContain(quit);
      } else {
        expect(labels).not.toContain(quit);
      }
    }
  });

  test("the page context menu uses the platform's message for each OS label", () => {
    setupWindowContextMenu({} as Parameters<typeof setupWindowContextMenu>[0]);

    const expectedLabels = {
      ...CONTEXT_MENU_MESSAGES,
      ...(context === "macOS" ? {} : NON_MACOS_CONTEXT_MENU_MESSAGES),
    };

    for (const [key, message] of Object.entries(expectedLabels)) {
      expect(contextMenuLabels[key as keyof Labels]).toBe(markedTranslation(context, message));
    }
  });
});
