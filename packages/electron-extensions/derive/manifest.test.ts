import { describe, expect, test } from "bun:test";
import { allowConnectSource, deriveManifest } from "./manifest";

const fileNames = {
  facadeFileName: "chrome-facade.js",
  serviceWorkerFileName: "chrome-facade-service-worker.js",
  bridgeConnectSource: "extension-native-messaging:",
};

describe("deriveManifest", () => {
  test("points the service worker at a wrapper importing the facade first", () => {
    const { manifest, serviceWorkerWrapper } = deriveManifest(
      {
        name: "1Password",
        background: { service_worker: "background/background.js", type: "module" },
      },
      fileNames,
    );

    expect(manifest.background).toEqual({
      service_worker: "chrome-facade-service-worker.js",
      type: "module",
    });
    expect(serviceWorkerWrapper).toContain('import "./chrome-facade.js";');
    expect(serviceWorkerWrapper).toContain('import "./background/background.js";');
    expect(serviceWorkerWrapper?.indexOf("chrome-facade.js")).toBeLessThan(
      serviceWorkerWrapper?.indexOf("background/background.js") ?? 0,
    );
  });

  test("imports with importScripts when the service worker is not a module", () => {
    const { serviceWorkerWrapper } = deriveManifest(
      { background: { service_worker: "background.js" } },
      fileNames,
    );

    expect(serviceWorkerWrapper).toContain('importScripts("/chrome-facade.js", "/background.js");');
  });

  test("keeps the key so the extension id stays the one it was installed as", () => {
    const { manifest } = deriveManifest(
      { key: "MIIBIjANBgkq", background: { service_worker: "background.js" } },
      fileNames,
    );

    expect(manifest.key).toBe("MIIBIjANBgkq");
  });

  test("leaves the source manifest alone", () => {
    const sourceManifest = {
      background: { service_worker: "background.js", type: "module" },
    };

    deriveManifest(sourceManifest, fileNames);

    expect(sourceManifest.background.service_worker).toBe("background.js");
  });

  test("writes no wrapper for a manifest without a service worker", () => {
    const { manifest, serviceWorkerWrapper } = deriveManifest({ name: "No background" }, fileNames);

    expect(serviceWorkerWrapper).toBeNull();
    expect(manifest.background).toBeUndefined();
  });

  test("lets the content security policy reach the bridge", () => {
    const { manifest } = deriveManifest(
      {
        content_security_policy: {
          extension_pages: "default-src 'none'; connect-src https://1password.com",
          sandbox: "sandbox allow-scripts",
        },
      },
      fileNames,
    );

    expect(manifest.content_security_policy).toEqual({
      extension_pages:
        "default-src 'none'; connect-src https://1password.com extension-native-messaging:",
      sandbox: "sandbox allow-scripts",
    });
  });

  test("leaves a manifest without a content security policy alone", () => {
    const { manifest } = deriveManifest({ name: "No policy" }, fileNames);

    expect(manifest.content_security_policy).toBeUndefined();
  });

  test("drops the permissions Electron declares but cannot serve", () => {
    const { manifest } = deriveManifest(
      {
        permissions: ["storage", "webRequest", "nativeMessaging", "webRequestAuthProvider", "tabs"],
      },
      fileNames,
    );

    expect(manifest.permissions).toEqual(["storage", "nativeMessaging", "tabs"]);
  });

  test("leaves a manifest without permissions alone", () => {
    const { manifest } = deriveManifest({ name: "No permissions" }, fileNames);

    expect(manifest.permissions).toBeUndefined();
  });

  test("derives the copy without the manifest keys it was told to strip", () => {
    const { manifest } = deriveManifest(
      {
        name: "1Password",
        content_scripts: [{ js: ["inline/inject-content-scripts.js"] }],
        declarative_net_request: { rule_resources: [] },
      },
      { ...fileNames, strippedManifestKeys: ["content_scripts", "declarative_net_request"] },
    );

    expect(manifest).toEqual({ name: "1Password" });
  });

  test("clamps every content script to the matches it was handed", () => {
    const { manifest } = deriveManifest(
      {
        name: "1Password",
        content_scripts: [
          {
            matches: ["<all_urls>"],
            js: ["inline/inject-content-scripts.js"],
            all_frames: true,
            run_at: "document_start",
          },
          { matches: ["https://*/*"], js: ["content.js"] },
        ],
      },
      { ...fileNames, contentScriptMatches: ["https://accounts.google.com/*"] },
    );

    expect(manifest.content_scripts).toEqual([
      {
        matches: ["https://accounts.google.com/*"],
        js: ["inline/inject-content-scripts.js"],
        all_frames: true,
        run_at: "document_start",
      },
      { matches: ["https://accounts.google.com/*"], js: ["content.js"] },
    ]);
  });

  test("drops a content script the clamped sites were never in reach of", () => {
    const { manifest } = deriveManifest(
      {
        name: "1Password",
        content_scripts: [
          { matches: ["<all_urls>"], js: ["inline/inject-content-scripts.js"] },
          { matches: ["https://app.kolide.com/*"], js: ["inline/injected/kolide.js"] },
        ],
      },
      { ...fileNames, contentScriptMatches: ["https://accounts.google.com/*"] },
    );

    // Handed the clamp, Kolide's script would run on a Google sign-in page it
    // never reached in the first place — 427 KB of 1Password's own such scripts
    expect(manifest.content_scripts).toEqual([
      { matches: ["https://accounts.google.com/*"], js: ["inline/inject-content-scripts.js"] },
    ]);
  });

  test("clamps a content script to the sites it reaches, not to every site named", () => {
    const { manifest } = deriveManifest(
      {
        name: "1Password",
        content_scripts: [{ matches: ["https://myaccount.google.com/*"], js: ["content.js"] }],
      },
      {
        ...fileNames,
        contentScriptMatches: ["https://accounts.google.com/*", "https://myaccount.google.com/*"],
      },
    );

    expect(manifest.content_scripts).toEqual([
      { matches: ["https://myaccount.google.com/*"], js: ["content.js"] },
    ]);
  });

  test("drops a content script with no matches of its own to narrow", () => {
    const { manifest } = deriveManifest(
      { name: "1Password", content_scripts: [{ js: ["content.js"] }] },
      { ...fileNames, contentScriptMatches: ["https://accounts.google.com/*"] },
    );

    expect(manifest.content_scripts).toEqual([]);
  });

  test("clamps nothing in a manifest without content scripts", () => {
    const { manifest } = deriveManifest(
      { name: "No content scripts" },
      { ...fileNames, contentScriptMatches: ["https://accounts.google.com/*"] },
    );

    expect(manifest.content_scripts).toBeUndefined();
  });

  test("leaves the content scripts alone without matches to clamp them to", () => {
    const contentScripts = [{ matches: ["<all_urls>"], js: ["content.js"] }];

    const { manifest } = deriveManifest(
      { name: "1Password", content_scripts: contentScripts },
      fileNames,
    );

    expect(manifest.content_scripts).toEqual(contentScripts);
  });

  test("refuses a manifest whose web accessible resources cover the facade", () => {
    expect(() =>
      deriveManifest(
        {
          web_accessible_resources: [{ resources: ["*.js"], matches: ["<all_urls>"] }],
        },
        fileNames,
      ),
    ).toThrow('web_accessible_resources pattern "*.js" makes "chrome-facade.js" fetchable');
  });

  test("refuses a pattern covering the service worker wrapper", () => {
    expect(() =>
      deriveManifest(
        {
          web_accessible_resources: [{ resources: ["chrome-facade-service-worker.js"] }],
        },
        fileNames,
      ),
    ).toThrow("chrome-facade-service-worker.js");
  });

  test("derives a manifest whose web accessible resources stay clear of the facade", () => {
    const { manifest } = deriveManifest(
      {
        web_accessible_resources: [
          {
            resources: ["fonts/*.woff2", "images/*.png", "inline/injected.js", "*.js.map"],
            matches: ["<all_urls>"],
          },
        ],
      },
      fileNames,
    );

    expect(manifest.web_accessible_resources).toEqual([
      {
        resources: ["fonts/*.woff2", "images/*.png", "inline/injected.js", "*.js.map"],
        matches: ["<all_urls>"],
      },
    ]);
  });

  test("derives a manifest whose web accessible resources were stripped away", () => {
    const { manifest } = deriveManifest(
      { web_accessible_resources: [{ resources: ["*.js"] }] },
      { ...fileNames, strippedManifestKeys: ["web_accessible_resources"] },
    );

    expect(manifest.web_accessible_resources).toBeUndefined();
  });

  test("strips nothing an extension does not have", () => {
    const { manifest } = deriveManifest(
      { name: "1Password" },
      {
        ...fileNames,
        strippedManifestKeys: ["content_scripts"],
      },
    );

    expect(manifest).toEqual({ name: "1Password" });
  });
});

describe("deriveManifest for a shared instance", () => {
  const workerOptions = { role: "worker", relayFileName: "chrome-runtime-proxy-relay.js" } as const;

  const contentScriptOnlyOptions = {
    role: "contentScriptOnly",
    shimFileName: "chrome-runtime-proxy-shim.js",
  } as const;

  test("the worker copy's wrapper imports the relay client between facade and background", () => {
    const { manifest, serviceWorkerWrapper } = deriveManifest(
      { background: { service_worker: "background.js", type: "module" } },
      { ...fileNames, sharedInstance: workerOptions },
    );

    expect(manifest.background?.service_worker).toBe("chrome-facade-service-worker.js");
    // The relay parks its job stream from the last line rather than during its
    // own evaluation, so no job reaches the worker before the extension's
    // top-level code has run
    expect(serviceWorkerWrapper).toBe(
      "// Generated when the extension was derived, in place of its own service worker.\n" +
        'import "./chrome-facade.js";\nimport "./chrome-runtime-proxy-relay.js";\nimport "./background.js";\n' +
        "globalThis.__meruRuntimeProxyStartRelay?.();\n",
    );
  });

  test("the worker copy's wrapper uses importScripts for a non-module worker", () => {
    const { serviceWorkerWrapper } = deriveManifest(
      { background: { service_worker: "background.js" } },
      { ...fileNames, sharedInstance: workerOptions },
    );

    expect(serviceWorkerWrapper).toBe(
      "// Generated when the extension was derived, in place of its own service worker.\n" +
        'importScripts("/chrome-facade.js", "/chrome-runtime-proxy-relay.js", "/background.js");\n' +
        "globalThis.__meruRuntimeProxyStartRelay?.();\n",
    );
  });

  test("a copy with no relay ends with its imports, exactly as before", () => {
    const { serviceWorkerWrapper } = deriveManifest(
      { background: { service_worker: "background.js", type: "module" } },
      fileNames,
    );

    expect(serviceWorkerWrapper).toBe(
      "// Generated when the extension was derived, in place of its own service worker.\n" +
        'import "./chrome-facade.js";\nimport "./background.js";\n',
    );
  });

  test("the content-script-only copy loses its background key entirely", () => {
    const { manifest, serviceWorkerWrapper } = deriveManifest(
      {
        background: { service_worker: "background.js", type: "module" },
        content_scripts: [{ matches: ["https://*/*"], js: ["content.js"] }],
      },
      { ...fileNames, sharedInstance: contentScriptOnlyOptions },
    );

    expect("background" in manifest).toBe(false);
    expect(serviceWorkerWrapper).toBeNull();
  });

  test("the shim runs first in every content script entry that has scripts", () => {
    const { manifest } = deriveManifest(
      {
        background: { service_worker: "background.js" },
        content_scripts: [
          { matches: ["https://*/*"], js: ["a.js", "b.js"] },
          { matches: ["https://*/*"], css: ["styles.css"] },
        ],
      },
      { ...fileNames, sharedInstance: contentScriptOnlyOptions },
    );

    expect(manifest.content_scripts).toEqual([
      { matches: ["https://*/*"], js: ["chrome-runtime-proxy-shim.js", "a.js", "b.js"] },
      { matches: ["https://*/*"], css: ["styles.css"] },
    ]);
  });

  test("the shim is prepended after the clamp narrows the matches", () => {
    const { manifest } = deriveManifest(
      { content_scripts: [{ matches: ["https://*/*"], js: ["content.js"] }] },
      {
        ...fileNames,
        contentScriptMatches: ["https://accounts.google.com/*"],
        sharedInstance: contentScriptOnlyOptions,
      },
    );

    expect(manifest.content_scripts).toEqual([
      {
        matches: ["https://accounts.google.com/*"],
        js: ["chrome-runtime-proxy-shim.js", "content.js"],
      },
    ]);
  });

  test("refuses a pattern making the token-carrying shim fetchable by pages", () => {
    expect(() =>
      deriveManifest(
        {
          web_accessible_resources: [
            { resources: ["chrome-runtime-proxy-shim.js"], matches: ["<all_urls>"] },
          ],
        },
        { ...fileNames, sharedInstance: contentScriptOnlyOptions },
      ),
    ).toThrow(/chrome-runtime-proxy-shim\.js/);
  });

  test("refuses a pattern covering the worker copy's relay client", () => {
    expect(() =>
      deriveManifest(
        {
          background: { service_worker: "background.js" },
          web_accessible_resources: [{ resources: ["*.js"], matches: ["<all_urls>"] }],
        },
        { ...fileNames, sharedInstance: workerOptions },
      ),
    ).toThrow();
  });

  test("derives without a role exactly as it does without the option", () => {
    const manifest = {
      background: { service_worker: "background.js", type: "module" },
      content_scripts: [{ matches: ["https://*/*"], js: ["content.js"] }],
    };

    expect(deriveManifest(manifest, { ...fileNames, sharedInstance: undefined })).toEqual(
      deriveManifest(manifest, fileNames),
    );
  });
});

describe("allowConnectSource", () => {
  const source = "extension-native-messaging:";

  test("appends to an existing connect-src", () => {
    expect(allowConnectSource("script-src 'self'; connect-src https://a.test", source)).toBe(
      "script-src 'self'; connect-src https://a.test extension-native-messaging:",
    );
  });

  test("adds nothing twice", () => {
    const contentSecurityPolicy = `connect-src https://a.test ${source}`;

    expect(allowConnectSource(contentSecurityPolicy, source)).toBe(contentSecurityPolicy);
  });

  test("derives connect-src from default-src, dropping 'none'", () => {
    expect(allowConnectSource("default-src 'none'; script-src 'self'", source)).toBe(
      "default-src 'none'; script-src 'self'; connect-src extension-native-messaging:",
    );
  });

  test("carries the other default-src sources over", () => {
    expect(allowConnectSource("default-src 'self' https://a.test", source)).toBe(
      "default-src 'self' https://a.test; connect-src 'self' https://a.test extension-native-messaging:",
    );
  });

  test("leaves a policy that restricts neither alone", () => {
    expect(allowConnectSource("script-src 'self'; object-src 'self'", source)).toBe(
      "script-src 'self'; object-src 'self'",
    );
  });
});
