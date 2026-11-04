import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { BrowserWindow, MenuItemConstructorOptions } from "electron";

const currentPlatform = { isMacOS: false, isWindows: false, isLinux: true };

mock.module("@electron-toolkit/utils", () => ({ platform: currentPlatform }));

let template: MenuItemConstructorOptions[] = [];

const popup = mock((_options: unknown) => {});

class ClipboardItem {
  constructor(readonly items: Record<string, unknown>) {}
}

const clipboardWrites: unknown[] = [];

const electron = {
  app: { isPackaged: true, on: () => {} },
  BrowserWindow: { getAllWindows: () => [] },
  ClipboardItem,
  clipboard: {
    writeText: mock((_text: string) => Promise.resolve()),
    write(data: unknown) {
      if (Array.isArray(data) && data.every((item) => item instanceof ClipboardItem)) {
        clipboardWrites.push(data);

        return Promise.resolve();
      }

      const rejection = Promise.reject(
        new TypeError("clipboard.write expects an array of ClipboardItem"),
      );

      // A caller may float the promise, and bun would then fail whichever test
      // is running at that moment rather than the click's own assertion.
      rejection.catch(() => {});

      return rejection;
    },
  },
  dialog: {},
  Menu: {
    buildFromTemplate: (items: MenuItemConstructorOptions[]) => {
      template = items;

      return { on: () => {}, popup };
    },
  },
  shell: { openExternal: mock((_url: string) => Promise.resolve()) },
};

mock.module("electron", () => ({ ...electron, default: electron }));

const download = mock((..._arguments: unknown[]) => Promise.resolve());

mock.module("electron-dl", () => ({ CancelError: class extends Error {}, download }));

const gmailUrl = "https://mail.google.com/mail/u/0/";

const workspaceUrl = "https://docs.google.com/document/d/1";

type ContextMenuListener = (event: unknown, parameters: unknown) => void;

function createView(url: string) {
  const view = {
    listener: undefined as ContextMenuListener | undefined,
    webContents: {
      copy: mock(),
      copyImageAt: mock(),
      cut: mock(),
      devToolsWebContents: { focus: mock() },
      focusedFrame: { name: "focused frame" },
      getURL: () => url,
      inspectElement: mock(),
      isDevToolsOpened: mock(() => false),
      on: (event: string, listener: ContextMenuListener) => {
        if (event === "context-menu") {
          view.listener = listener;
        }
      },
      once: () => {},
      paste: mock(),
      pasteAndMatchStyle: mock(),
      replaceMisspelling: mock(),
      selectAll: mock(),
      session: { addWordToSpellCheckerDictionary: mock() },
      showDefinitionForSelection: mock(),
    },
  };

  return view;
}

const gmail: {
  messageId: string | undefined;
  userEmail: string | undefined;
  view: ReturnType<typeof createView>;
} = {
  messageId: "message",
  userEmail: "user@example.com",
  view: createView(gmailUrl),
};

const licenseKey = { isValid: true };

mock.module("./accounts", () => ({
  accounts: {
    getSelectedAccount: () => ({ instance: { gmail } }),
  },
}));

mock.module("./lib/deep-link", () => ({ createMeruMessageUrl: () => "meru://message" }));

mock.module("./lib/log", () => ({
  log: { error: () => {} },
}));

mock.module("./license-key", () => ({ licenseKey }));

const openExternalUrl = mock((..._arguments: unknown[]) => {});

mock.module("./url", () => ({ openExternalUrl }));

const { setupWindowContextMenu } = await import("./context-menu");

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
  dictionarySuggestions: [] as string[],
  editFlags,
  isEditable: false,
  linkText: "",
  linkURL: "",
  mediaType: "none",
  misspelledWord: "",
  selectionText: "",
  srcURL: "",
  x: 0,
  y: 0,
};

function rightClick(
  view: ReturnType<typeof createView>,
  parameters: Record<string, unknown>,
  pageURL = view.webContents.getURL(),
) {
  setupWindowContextMenu(view as unknown as BrowserWindow);

  view.listener?.({}, { ...NO_CLICK, pageURL, ...parameters });

  return template;
}

function setPlatform(platform: keyof typeof currentPlatform) {
  currentPlatform.isMacOS = platform === "isMacOS";
  currentPlatform.isWindows = platform === "isWindows";
  currentPlatform.isLinux = platform === "isLinux";
}

const realProcessPlatform = process.platform;

function setProcessPlatform(value: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

afterAll(() => {
  setProcessPlatform(realProcessPlatform);
});

function setLicensedMessage(open: boolean) {
  licenseKey.isValid = open;
  gmail.messageId = open ? "message" : undefined;
  gmail.userEmail = open ? "user@example.com" : undefined;
}

beforeEach(() => {
  template = [];
  clipboardWrites.length = 0;
  popup.mockClear();
  electron.clipboard.writeText.mockClear();
  electron.shell.openExternal.mockClear();
  download.mockClear();
  openExternalUrl.mockClear();
  setPlatform("isLinux");
  setProcessPlatform("linux");
  setLicensedMessage(true);
  gmail.view = createView(gmailUrl);
});

function openContextMenuItems(parameters: Record<string, unknown>, pageURL = workspaceUrl) {
  return rightClick(createView(pageURL), parameters);
}

function openContextMenu(parameters: Record<string, unknown>) {
  // A single `&` marks the access key and `&&` is a literal ampersand, as Electron reads them.
  return openContextMenuItems(parameters).flatMap(({ label }) =>
    label ? [label.replaceAll(/&(.)/g, "$1")] : [],
  );
}

describe("context menu in a Workspace app view", () => {
  test("gives every item on a link its own label", () => {
    const labels = openContextMenu({
      linkText: "Example",
      linkURL: "https://example.com/",
    });

    expect(labels).toContain("Copy Link Address");
    expect(labels).toContain("Copy URL");
    expect(labels.filter((label, index) => labels.indexOf(label) !== index)).toEqual([]);
  });
});

describe("context menu on an open Gmail message", () => {
  function openOn(platform: "isMacOS" | "isWindows" | "isLinux") {
    setPlatform(platform);

    return rightClick(gmail.view, {});
  }

  for (const platform of ["isWindows", "isLinux"] as const) {
    test(`has no Share item on ${platform.slice(2)}`, () => {
      const items = openOn(platform);

      expect(items.map(({ label }) => label)).toContain("Copy Message Link");
      expect(items.filter(({ role }) => role === "shareMenu")).toEqual([]);
      expect(
        items.filter(
          ({ type }, index) => type === "separator" && items[index + 1]?.type === "separator",
        ),
      ).toEqual([]);
    });
  }

  test("has a Share item for the message link on macOS", () => {
    expect(openOn("isMacOS").filter(({ role }) => role === "shareMenu")).toEqual([
      { label: "Share", role: "shareMenu", sharingItem: { urls: ["meru://message"] } },
    ]);
  });

  test("has no message items on a page other than Gmail's own", () => {
    const labels = rightClick(gmail.view, {}, `${gmailUrl}#other`).map(({ label }) => label);

    expect(labels).not.toContain("Copy Message Link");
  });

  test("has no message items without a license", () => {
    licenseKey.isValid = false;

    expect(rightClick(gmail.view, {}).map(({ label }) => label)).not.toContain("Copy Message Link");
  });
});

const LINK = { linkURL: "https://example.com/", linkText: "Example" };

const IMAGE = { mediaType: "image", srcURL: "https://example.com/image.png" };

const MISSPELLED = { selectionText: "Mreu", misspelledWord: "Mreu" };

/** What was right-clicked, each shown by a different set of items. */
const CLICKS: Record<string, Record<string, unknown>> = {
  "a page": {},
  "selected text": { selectionText: "Meru" },
  "selected text that cannot be copied": {
    selectionText: "Meru",
    editFlags: { ...editFlags, canCopy: false },
  },
  "selected text with surrounding space": { selectionText: "  Meru\n" },
  "selected text with an ampersand": { selectionText: "Fish & Chips" },
  "selected text of 25 characters": { selectionText: "a".repeat(25) },
  "selected text of 26 characters": { selectionText: "a".repeat(26) },
  "selected text with an ampersand past the cut": {
    selectionText: `${"a".repeat(30)} & more`,
  },
  "selected text on a link": { ...LINK, selectionText: "Example" },
  "a text field": { isEditable: true, selectionText: "Meru" },
  "an empty text field": { isEditable: true },
  "a text field with nothing it can do": {
    isEditable: true,
    selectionText: "Meru",
    editFlags: { ...editFlags, canCut: false, canCopy: false, canPaste: false },
  },
  "a misspelled word": { ...MISSPELLED, isEditable: true, dictionarySuggestions: ["Meru"] },
  "a misspelled word with several suggestions": {
    ...MISSPELLED,
    isEditable: true,
    dictionarySuggestions: ["Meru", "Menu", "Mere"],
  },
  "a misspelled word without suggestions": { ...MISSPELLED, isEditable: true },
  "a misspelled word outside a text field": {
    ...MISSPELLED,
    dictionarySuggestions: ["Meru"],
  },
  "a misspelled word outside a text field without suggestions": MISSPELLED,
  "a misspelled word nothing is selected on": {
    isEditable: true,
    misspelledWord: "Mreu",
    dictionarySuggestions: ["Meru"],
  },
  "a link": LINK,
  "a link without text": { linkURL: "https://example.com/" },
  "a link in a text field": { ...LINK, isEditable: true },
  "an email link": { linkURL: "mailto:someone@example.com", linkText: "someone@example.com" },
  "an image": IMAGE,
  "a linked image": { ...IMAGE, linkURL: "https://example.com/" },
  "an image linked to an email address": { ...IMAGE, linkURL: "mailto:someone@example.com" },
  "a video": { mediaType: "video", srcURL: "https://example.com/video.mp4" },
  "a linked video": {
    mediaType: "video",
    srcURL: "https://example.com/video.mp4",
    linkURL: "https://example.com/",
  },
  "everything at once": {
    ...MISSPELLED,
    ...IMAGE,
    linkURL: "mailto:someone@example.com",
    isEditable: true,
    dictionarySuggestions: ["Meru"],
  },
};

const LAYOUT_PLATFORMS = [
  { name: "macOS", flag: "isMacOS", processPlatform: "darwin" },
  { name: "Windows", flag: "isWindows", processPlatform: "win32" },
  { name: "Linux", flag: "isLinux", processPlatform: "linux" },
] as const;

const LAYOUT_VIEWS = [
  { name: "a licensed Gmail message", isGmail: true, isLicensedMessage: true },
  { name: "Gmail", isGmail: true, isLicensedMessage: false },
  { name: "a Workspace view", isGmail: false, isLicensedMessage: false },
];

describe.each([...LAYOUT_PLATFORMS])("layout on $name", ({ flag, processPlatform }) => {
  describe.each(LAYOUT_VIEWS)("in $name", ({ isGmail, isLicensedMessage }) => {
    test.each(Object.keys(CLICKS))("on %s", (click) => {
      setPlatform(flag);
      setProcessPlatform(processPlatform);
      setLicensedMessage(isLicensedMessage);

      const items = rightClick(
        isGmail ? gmail.view : createView(workspaceUrl),
        CLICKS[click] ?? {},
      );

      expect(
        items.map(({ id, label, type, enabled }) => ({ id, label, type, enabled })),
      ).toMatchSnapshot();
    });
  });
});

/** The item's own click handler, called the way Electron calls it. */
function clickItem(items: MenuItemConstructorOptions[], find: string) {
  const item = items.find(({ id, label }) => id === find || label === find);

  if (!item) {
    throw new Error(`The menu has no item ${find}`);
  }

  (item.click as unknown as (menuItem: unknown) => void)(item);
}

/** Past the microtasks an asynchronous click handler awaits on. */
const settle = () => Bun.sleep(0);

describe("clicking", () => {
  test("a spelling suggestion replaces the misspelled word", () => {
    const view = createView(workspaceUrl);

    clickItem(
      rightClick(view, { ...MISSPELLED, isEditable: true, dictionarySuggestions: ["Meru"] }),
      "Meru",
    );

    expect(view.webContents.replaceMisspelling.mock.calls).toEqual([["Meru"]]);
  });

  test("Learn Spelling adds the word to the dictionary", () => {
    const view = createView(workspaceUrl);

    clickItem(
      rightClick(view, { ...MISSPELLED, isEditable: true, dictionarySuggestions: ["Meru"] }),
      "learnSpelling",
    );

    expect(view.webContents.session.addWordToSpellCheckerDictionary.mock.calls).toEqual([["Mreu"]]);
  });

  test("Look Up shows the definition of the selection on macOS", () => {
    setPlatform("isMacOS");
    setProcessPlatform("darwin");

    const view = createView(workspaceUrl);

    clickItem(rightClick(view, { selectionText: "Meru" }), "lookUpSelection");

    expect(view.webContents.showDefinitionForSelection).toHaveBeenCalledTimes(1);
  });

  test("Search with Google opens the search for the selection", () => {
    clickItem(openContextMenuItems({ selectionText: "Fish & Chips" }), "searchWithGoogle");

    expect(electron.shell.openExternal.mock.calls).toEqual([
      ["https://www.google.com/search?q=Fish+%26+Chips"],
    ]);
  });

  for (const id of ["cut", "copy", "paste", "pasteAndMatchStyle", "selectAll"] as const) {
    test(`${id} runs on the view`, () => {
      const view = createView(workspaceUrl);

      clickItem(rightClick(view, { isEditable: true, selectionText: "Meru" }), id);

      expect(view.webContents[id]).toHaveBeenCalledTimes(1);
    });
  }

  test("Save Image As downloads the image through a save dialog", () => {
    const view = createView(workspaceUrl);

    clickItem(rightClick(view, IMAGE), "saveImageAs");

    expect(download.mock.calls).toEqual([[view, IMAGE.srcURL, { saveAs: true }]]);
  });

  test("Copy Image copies the image under the click", () => {
    const view = createView(workspaceUrl);

    clickItem(rightClick(view, { ...IMAGE, x: 12, y: 34 }), "copyImage");

    expect(view.webContents.copyImageAt.mock.calls).toEqual([[12, 34]]);
  });

  test("Copy Message Link copies the message's Meru link", async () => {
    clickItem(rightClick(gmail.view, {}), "Copy Message Link");

    await settle();

    expect(electron.clipboard.writeText.mock.calls).toEqual([["meru://message"]]);
  });

  test("Copy URL copies the view's address", async () => {
    clickItem(openContextMenuItems({}), "Copy URL");

    await settle();

    expect(electron.clipboard.writeText.mock.calls).toEqual([[workspaceUrl]]);
  });

  test("Open in Default Browser opens the view's address", () => {
    clickItem(openContextMenuItems({}), "Open in Default Browser");

    expect(openExternalUrl.mock.calls).toEqual([[workspaceUrl, { skipTrustedHostCheck: true }]]);
  });

  test("Inspect Element inspects the point clicked, leaving closed devtools alone", () => {
    const view = createView(workspaceUrl);

    clickItem(rightClick(view, { x: 12, y: 34 }), "Inspect Element");

    expect(view.webContents.inspectElement.mock.calls).toEqual([[12, 34]]);
    expect(view.webContents.devToolsWebContents.focus).not.toHaveBeenCalled();
  });

  test("Inspect Element focuses devtools that are open", () => {
    const view = createView(workspaceUrl);

    view.webContents.isDevToolsOpened.mockImplementation(() => true);

    clickItem(rightClick(view, { x: 12, y: 34 }), "Inspect Element");

    expect(view.webContents.devToolsWebContents.focus).toHaveBeenCalledTimes(1);
  });
});

describe("the clipboard", () => {
  function bookmark(title: string, url: string) {
    return [
      new ClipboardItem({
        "text/plain": url,
        "electron application/bookmark": { title, url },
      }),
    ];
  }

  test("Copy Link Address writes a bookmark of the link", async () => {
    clickItem(openContextMenuItems(LINK), "copyLink");

    await settle();

    clickItem(openContextMenuItems({ linkURL: "https://example.com/no-text" }), "copyLink");

    await settle();

    expect(clipboardWrites).toEqual([
      bookmark("Example", "https://example.com/"),
      bookmark("", "https://example.com/no-text"),
    ]);
  });

  test("Copy Image Address writes a bookmark of the image", async () => {
    clickItem(openContextMenuItems(IMAGE), "copyImageAddress");

    await settle();

    expect(clipboardWrites).toEqual([bookmark(IMAGE.srcURL, IMAGE.srcURL)]);
  });

  test("Copy Email Address writes the address, stripping only the scheme", async () => {
    clickItem(
      openContextMenuItems({ linkURL: "mailto:someone@example.com?subject=mailto:" }),
      "copyEmailAddress",
    );

    await settle();

    expect(electron.clipboard.writeText.mock.calls).toEqual([
      ["someone@example.com?subject=mailto:"],
    ]);
  });
});

describe("showing the menu", () => {
  test("pops up in the frame that has focus", () => {
    const view = createView(workspaceUrl);

    rightClick(view, {});

    expect(popup.mock.calls).toEqual([[{ frame: view.webContents.focusedFrame }]]);
  });
});
