(() => {
  const found = [];
  for (const k of Object.keys(globalThis)) {
    if (/bitwarden|autofill|inline|bw/i.test(k)) {
      found.push(k);
    }
  }
  return JSON.stringify({
    url: location.href,
    globals: found,
    hasChrome: typeof chrome,
    runtimeId: typeof chrome !== "undefined" && chrome.runtime ? chrome.runtime.id : null,
    shimInstalled: Object.keys(globalThis).filter((k) => /proxy|shim|meru/i.test(k)),
    bwElements: [...document.querySelectorAll("*")]
      .filter(
        (e) => e.tagName.toLowerCase().includes("bitwarden") || (e.id || "").includes("bitwarden"),
      )
      .map((e) => `${e.tagName}#${e.id}`),
  });
})();
