import { describe, expect, test } from "bun:test";
import { allowPageConnectSource, injectPageScripts } from "./html";

describe("injectPageScripts", () => {
  test("runs the loader's scripts before the page's own", () => {
    const page = injectPageScripts(
      '<!doctype html><html><head><title>Popup</title><script src="/popup.js"></script></head></html>',
      ["/chrome-facade.js"],
    );

    expect(page).toStartWith(
      '<!doctype html><html><head><script src="/chrome-facade.js"></script>',
    );
    expect(page.indexOf("/chrome-facade.js")).toBeLessThan(page.indexOf("/popup.js"));
  });

  test("keeps the order it was given", () => {
    const page = injectPageScripts('<html><head><script src="/popup.js"></script></head></html>', [
      "/chrome-facade.js",
      "/chrome-runtime-proxy-shim.js",
    ]);

    expect(page).toBe(
      '<html><head><script src="/chrome-facade.js"></script><script src="/chrome-runtime-proxy-shim.js"></script><script src="/popup.js"></script></head></html>',
    );
  });

  test("falls back to the html tag when there is no head", () => {
    expect(injectPageScripts("<html><body>Hi</body></html>", ["/chrome-facade.js"])).toBe(
      '<html><script src="/chrome-facade.js"></script><body>Hi</body></html>',
    );
  });

  test("prepends when there is no markup to anchor to", () => {
    expect(injectPageScripts("Hi", ["/chrome-facade.js"])).toBe(
      '<script src="/chrome-facade.js"></script>Hi',
    );
  });

  test("injects each script once", () => {
    const scriptUrls = ["/chrome-facade.js", "/chrome-runtime-proxy-shim.js"];

    const page = injectPageScripts("<html><head></head></html>", scriptUrls);

    expect(injectPageScripts(page, scriptUrls)).toBe(page);
  });
});

describe("allowPageConnectSource", () => {
  test("widens a page policy that pins connect-src", () => {
    expect(
      allowPageConnectSource(
        `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src https://1password.com" /></head></html>`,
        "extension-bridge:",
      ),
    ).toBe(
      `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src https://1password.com extension-bridge:" /></head></html>`,
    );
  });

  test("gives a page policy without connect-src one, the way the manifest gets it", () => {
    expect(
      allowPageConnectSource(
        `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'">`,
        "extension-bridge:",
      ),
    ).toBe(
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; connect-src extension-bridge:">`,
    );
  });

  test("leaves a page that declares no policy of its own alone", () => {
    const page = `<html><head><meta charset="utf-8"><title>Popup</title></head></html>`;

    expect(allowPageConnectSource(page, "extension-bridge:")).toBe(page);
  });

  test("widens every policy the page declares", () => {
    const page = allowPageConnectSource(
      `<meta http-equiv="content-security-policy" content="default-src 'none'"><meta http-equiv="Content-Security-Policy" content="connect-src 'self'">`,
      "extension-bridge:",
    );

    expect(page).toContain(`content="default-src 'none'; connect-src extension-bridge:"`);
    expect(page).toContain(`content="connect-src 'self' extension-bridge:"`);
  });

  test("reads and writes the attribute's escapes rather than through them", () => {
    expect(
      allowPageConnectSource(
        `<meta http-equiv="Content-Security-Policy" content='default-src &#39;none&#39;'>`,
        "extension-bridge:",
      ),
    ).toBe(
      `<meta http-equiv="Content-Security-Policy" content='default-src &#39;none&#39;; connect-src extension-bridge:'>`,
    );
  });
});
