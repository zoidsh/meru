(async () => {
  const out = { steps: [] };
  const say = (label, value) => out.steps.push([label, value]);

  const ask = (message) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          resolve({
            response: response === undefined ? "undefined" : response,
            lastError: chrome.runtime.lastError?.message ?? null,
          });
        });
      } catch (error) {
        resolve({ threw: String(error) });
      }
    });

  say("triggerAutofillScriptInjection", await ask({ command: "triggerAutofillScriptInjection" }));
  say("bgGetAuthStatus", await ask({ command: "bgGetAuthStatus" }));
  say("checkAuthStatus", await ask({ command: "checkAuthStatus" }));

  await new Promise((resolve) => setTimeout(resolve, 1200));

  say(
    "autofillGlobalsAfter",
    Object.keys(globalThis).filter((key) => /bitwarden|autofill|inline/i.test(key)),
  );
  say(
    "bwDomAfter",
    [...document.querySelectorAll("*")]
      .filter(
        (element) => /bitwarden/i.test(element.tagName) || /bitwarden/i.test(element.id || ""),
      )
      .map((element) => element.tagName),
  );

  return JSON.stringify(out, null, 1);
})();
