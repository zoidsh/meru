import { describe, expect, test } from "bun:test";
import { injectFacadeScript } from "./html";

describe("injectFacadeScript", () => {
  test("runs the facade before the page's own scripts", () => {
    const page = injectFacadeScript(
      '<!doctype html><html><head><title>Popup</title><script src="/popup.js"></script></head></html>',
      "/chrome-facade.js",
    );

    expect(page).toStartWith(
      '<!doctype html><html><head><script src="/chrome-facade.js"></script>',
    );
    expect(page.indexOf("/chrome-facade.js")).toBeLessThan(page.indexOf("/popup.js"));
  });

  test("falls back to the html tag when there is no head", () => {
    expect(injectFacadeScript("<html><body>Hi</body></html>", "/chrome-facade.js")).toBe(
      '<html><script src="/chrome-facade.js"></script><body>Hi</body></html>',
    );
  });

  test("prepends when there is no markup to anchor to", () => {
    expect(injectFacadeScript("Hi", "/chrome-facade.js")).toBe(
      '<script src="/chrome-facade.js"></script>Hi',
    );
  });

  test("injects once", () => {
    const page = injectFacadeScript("<html><head></head></html>", "/chrome-facade.js");

    expect(injectFacadeScript(page, "/chrome-facade.js")).toBe(page);
  });
});
