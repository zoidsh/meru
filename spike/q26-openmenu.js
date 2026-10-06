(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const field = document.querySelector("#identifierId");
  field?.focus();
  field?.click();

  await wait(500);

  const send = (message) =>
    Promise.race([
      new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (response) =>
          resolve({
            response: response === undefined ? "undefined" : response,
            lastError: chrome.runtime.lastError?.message ?? null,
          }),
        );
      }),
      new Promise((resolve) => setTimeout(() => resolve("TIMEOUT"), 3000)),
    ]);

  const steps = {};
  steps.updateFocused = await send({ command: "updateFocusedFieldData", focusedFieldData: {} });
  steps.openInlineMenu = await send({ command: "openAutofillInlineMenu" });
  steps.checkOpen = await send({ command: "checkIsInlineMenuButtonVisible" });

  await wait(2500);

  steps.bodyChildren = [...document.body.children].map((element) => element.tagName.toLowerCase());
  steps.extensionFrames = [...document.querySelectorAll("iframe")]
    .map((frame) => frame.src.slice(0, 60))
    .filter((src) => src.startsWith("chrome-extension:"));

  return steps;
})();
