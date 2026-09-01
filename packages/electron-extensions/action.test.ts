import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  type ActionExtension,
  type ActionManifest,
  createExtensionAction,
  getActionPopupUrl,
  readExtensionActionIcon,
  resolveActionIconPath,
} from "./action";

let extensionDir: string;

beforeEach(async () => {
  extensionDir = await mkdtemp(path.join(tmpdir(), "electron-extensions-action-"));
});

afterEach(async () => {
  await rm(extensionDir, { recursive: true, force: true });
});

function createExtension(manifest: ActionManifest): ActionExtension {
  return {
    id: "aeblfdkhhhdcdjpifhhbdiojplfjncoa",
    name: "1Password",
    path: extensionDir,
    manifest,
  };
}

describe("resolveActionIconPath", () => {
  test("takes the action's own icon over the extension's", () => {
    expect(
      resolveActionIconPath({
        action: { default_icon: { "32": "action-32.png" } },
        icons: { "32": "icon-32.png" },
      }),
    ).toBe("action-32.png");
  });

  test("takes a single declared icon whatever its size", () => {
    expect(resolveActionIconPath({ action: { default_icon: "action.png" } })).toBe("action.png");
  });

  test("falls back to the extension's icons, which is what 1Password leaves", () => {
    expect(
      resolveActionIconPath({
        action: { default_title: "1Password", default_popup: "popup/index.html" },
        icons: { "16": "onepassword-16.png", "48": "onepassword-48.png" },
      }),
    ).toBe("onepassword-48.png");
  });

  test("takes the smallest icon that covers the size it is drawn at", () => {
    expect(
      resolveActionIconPath({
        icons: { "128": "128.png", "16": "16.png", "32": "32.png", "48": "48.png" },
      }),
    ).toBe("32.png");
  });

  test("takes the largest icon when none covers it", () => {
    expect(resolveActionIconPath({ icons: { "16": "16.png", "24": "24.png" } })).toBe("24.png");
  });

  test("reads a manifest v2 browser action", () => {
    expect(resolveActionIconPath({ browser_action: { default_icon: "browser-action.png" } })).toBe(
      "browser-action.png",
    );
  });

  test("has nothing to resolve without icons", () => {
    expect(resolveActionIconPath({ action: { default_popup: "popup.html" } })).toBe(null);
    expect(resolveActionIconPath({ icons: {} })).toBe(null);
  });
});

describe("getActionPopupUrl", () => {
  test("builds an extension URL from the declared page", () => {
    expect(getActionPopupUrl("aaa", { action: { default_popup: "popup/index.html" } })).toBe(
      "chrome-extension://aaa/popup/index.html",
    );
  });

  test("keeps a page declared from the extension root", () => {
    expect(getActionPopupUrl("aaa", { action: { default_popup: "/popup.html" } })).toBe(
      "chrome-extension://aaa/popup.html",
    );
  });

  test("keeps a query the page is opened with", () => {
    expect(getActionPopupUrl("aaa", { action: { default_popup: "popup.html?view=list" } })).toBe(
      "chrome-extension://aaa/popup.html?view=list",
    );
  });

  test("is nothing for an extension without a popup", () => {
    expect(getActionPopupUrl("aaa", { action: { default_title: "Title" } })).toBe(null);
    expect(getActionPopupUrl("aaa", {})).toBe(null);
  });

  test("refuses a popup that resolves outside the extension", () => {
    expect(getActionPopupUrl("aaa", { action: { default_popup: "https://example.com/x" } })).toBe(
      null,
    );
    expect(getActionPopupUrl("aaa", { action: { default_popup: "//example.com/x" } })).toBe(null);
    expect(
      getActionPopupUrl("aaa", { action: { default_popup: "chrome-extension://bbb/popup.html" } }),
    ).toBe(null);
  });

  test("keeps a page a relative path walks back to the extension root", () => {
    expect(getActionPopupUrl("aaa", { action: { default_popup: "../../popup.html" } })).toBe(
      "chrome-extension://aaa/popup.html",
    );
  });
});

describe("createExtensionAction", () => {
  test("assembles what a button is drawn from", () => {
    expect(
      createExtensionAction(
        createExtension({
          action: { default_title: "1Password", default_popup: "popup/index.html" },
          icons: { "48": "onepassword-48.png" },
        }),
      ),
    ).toEqual({
      extensionId: "aeblfdkhhhdcdjpifhhbdiojplfjncoa",
      name: "1Password",
      title: "1Password",
      popupUrl: "chrome-extension://aeblfdkhhhdcdjpifhhbdiojplfjncoa/popup/index.html",
      iconDataUrl: null,
    });
  });

  test("falls back to the extension name for the title", () => {
    expect(createExtensionAction(createExtension({ action: {} })).title).toBe("1Password");
  });

  test("has no popup for an extension that expects a click instead", () => {
    expect(createExtensionAction(createExtension({})).popupUrl).toBe(null);
  });
});

describe("readExtensionActionIcon", () => {
  test("reads the icon out of the extension as a data URL", async () => {
    await mkdir(path.join(extensionDir, "images"), { recursive: true });

    await writeFile(path.join(extensionDir, "images", "icon-48.png"), "icon");

    expect(
      await readExtensionActionIcon(createExtension({ icons: { "48": "images/icon-48.png" } })),
    ).toBe(`data:image/png;base64,${Buffer.from("icon").toString("base64")}`);
  });

  test("has nothing to read without an icon", async () => {
    expect(await readExtensionActionIcon(createExtension({}))).toBe(null);
  });

  test("skips an icon in a format a renderer would not draw", async () => {
    expect(await readExtensionActionIcon(createExtension({ icons: { "48": "icon.ico" } }))).toBe(
      null,
    );
  });

  test("fails on an icon the manifest declares but the extension does not carry", () => {
    expect(
      readExtensionActionIcon(createExtension({ icons: { "48": "missing.png" } })),
    ).rejects.toThrow();
  });

  test("refuses an icon the manifest points outside the extension at", async () => {
    await writeFile(path.join(path.dirname(extensionDir), "outside.png"), "outside");

    expect(
      readExtensionActionIcon(createExtension({ icons: { "48": "../outside.png" } })),
    ).rejects.toThrow(/outside the extension/);
  });

  test("reads an icon declared from the extension root", async () => {
    await writeFile(path.join(extensionDir, "icon-48.png"), "icon");

    expect(
      await readExtensionActionIcon(createExtension({ icons: { "48": "/icon-48.png" } })),
    ).toBe(`data:image/png;base64,${Buffer.from("icon").toString("base64")}`);
  });
});
