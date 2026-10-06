(async () => {
  const out = {};
  const url = chrome.runtime.getURL("content/bootstrap-autofill-overlay.js");
  out.url = url;

  try {
    const response = await fetch(url);
    out.fetch = `${response.status} ${(await response.text()).length} bytes`;
  } catch (error) {
    out.fetch = `THREW ${error}`;
  }

  try {
    // eslint-disable-next-line no-eval
    out.eval = eval("1+1");
  } catch (error) {
    out.eval = `THREW ${error}`;
  }

  try {
    out.newFunction = new Function("return 2+2")();
  } catch (error) {
    out.newFunction = `THREW ${error}`;
  }

  try {
    const module = await import(url);
    out.dynamicImport = `OK keys=${Object.keys(module).join(",")}`;
  } catch (error) {
    out.dynamicImport = `THREW ${error}`;
  }

  out.globalsAfterImport = Object.keys(globalThis).filter((key) =>
    /bitwarden|autofill|inline/i.test(key),
  );
  out.bwDomAfterImport = [...document.querySelectorAll("*")]
    .filter((element) => /bitwarden/i.test(element.tagName) || /bitwarden/i.test(element.id || ""))
    .map((element) => element.tagName);

  return JSON.stringify(out, null, 1);
})();
