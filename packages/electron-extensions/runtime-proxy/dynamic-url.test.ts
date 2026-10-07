import { describe, expect, test } from "bun:test";
import type { ChromeNamespace } from "../facade/lib/chrome";
import { createDynamicUrlRewrite } from "./dynamic-url";

const EXTENSION_ID = "nngceckbapebfimnlniiiahkandclblb";

const DYNAMIC_ID = "bec4da0e-2d57-420f-a703-2eb55e3bab59";

function createExtensionApi(manifest: Record<string, unknown>, dynamicId = DYNAMIC_ID) {
  return {
    runtime: { id: EXTENSION_ID, dynamicId, getManifest: () => manifest },
  } as ChromeNamespace;
}

const dynamicManifest = {
  web_accessible_resources: [
    { resources: ["overlay/menu-button.html"], matches: ["<all_urls>"], use_dynamic_url: true },
  ],
};

describe("createDynamicUrlRewrite", () => {
  test("rewrites the worker's dynamic origin to the static one, wherever it appears", () => {
    const rewrite = createDynamicUrlRewrite(createExtensionApi(dynamicManifest));

    const body = JSON.stringify({
      message: {
        command: "initAutofillInlineMenuButton",
        iframeUrl: `chrome-extension://${DYNAMIC_ID}/overlay/menu-button.html`,
        styleSheetUrl: `chrome-extension://${DYNAMIC_ID}/overlay/menu-button.css`,
      },
    });

    expect(JSON.parse(rewrite?.(body) ?? "")).toEqual({
      message: {
        command: "initAutofillInlineMenuButton",
        iframeUrl: `chrome-extension://${EXTENSION_ID}/overlay/menu-button.html`,
        styleSheetUrl: `chrome-extension://${EXTENSION_ID}/overlay/menu-button.css`,
      },
    });
  });

  test("leaves a body without the dynamic origin as it was", () => {
    const rewrite = createDynamicUrlRewrite(createExtensionApi(dynamicManifest));

    const body = JSON.stringify({ id: DYNAMIC_ID, url: `chrome-extension://${EXTENSION_ID}/a` });

    expect(rewrite?.(body)).toBe(body);
  });

  test("rewrites nothing for an extension that never asks for dynamic URLs", () => {
    expect(
      createDynamicUrlRewrite(
        createExtensionApi({
          web_accessible_resources: [{ resources: ["frame.html"], matches: ["<all_urls>"] }],
        }),
      ),
    ).toBeUndefined();

    expect(createDynamicUrlRewrite(createExtensionApi({}))).toBeUndefined();
  });

  test("rewrites nothing where there is no dynamic id to rewrite", () => {
    expect(createDynamicUrlRewrite(createExtensionApi(dynamicManifest, ""))).toBeUndefined();

    expect(
      createDynamicUrlRewrite(createExtensionApi(dynamicManifest, EXTENSION_ID)),
    ).toBeUndefined();

    expect(createDynamicUrlRewrite(undefined)).toBeUndefined();
  });
});
