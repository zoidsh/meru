(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const field =
    document.querySelector("#identifierId") ||
    document.querySelector("input[type=email],input[type=text]");

  field?.focus();
  field?.click();
  field?.dispatchEvent(new Event("focus", { bubbles: true }));

  await wait(2500);

  const extensionFrames = [...document.querySelectorAll("iframe")]
    .map((frame) => frame.src)
    .filter((src) => src.startsWith("chrome-extension:"));

  const custom = [...document.querySelectorAll("*")]
    .filter((element) => element.tagName.includes("-") || element.shadowRoot)
    .map((element) => element.tagName.toLowerCase() + (element.shadowRoot ? "[shadow]" : ""));

  return {
    focused: Boolean(field),
    activeElement: document.activeElement?.id || document.activeElement?.tagName,
    extensionFrames,
    custom: custom.slice(0, 20),
    bodyChildTags: [...document.body.children].map((element) => element.tagName.toLowerCase()),
  };
})();
