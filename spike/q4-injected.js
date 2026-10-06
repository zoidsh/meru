(() => ({
  url: location.href,
  bwDom: [...document.querySelectorAll("*")]
    .filter((element) => /bitwarden/i.test(element.tagName) || /bitwarden/i.test(element.id || ""))
    .map((element) => element.tagName + (element.id ? `#${element.id}` : "")),
  fields: [...document.querySelectorAll("input")].map((input) => ({
    type: input.type,
    name: input.name,
    id: input.id,
    hasBwAttrs: [...input.attributes]
      .map((a) => a.name)
      .filter((n) => /bitwarden|data-bw/i.test(n)),
  })),
  isolatedGlobals: Object.keys(globalThis).filter((key) =>
    /bitwarden|autofill|inline|overlay|notification/i.test(key),
  ),
}))();
