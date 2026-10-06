(async () => {
  const tabs = await chrome.tabs.query({});
  const target = tabs.find((tab) => /accounts\.google\.com/.test(tab.url || ""));

  if (!target) {
    return { tabs: tabs.map((tab) => (tab.url || "").slice(0, 50)) };
  }

  const race = (message) =>
    Promise.race([
      new Promise((resolve) => {
        chrome.tabs.sendMessage(target.id, message, (response) =>
          resolve({
            response: response === undefined ? "undefined" : response,
            lastError: chrome.runtime.lastError?.message ?? null,
          }),
        );
      }),
      new Promise((resolve) => setTimeout(() => resolve("TIMEOUT"), 4000)),
    ]);

  return {
    tabId: target.id,
    tabUrl: (target.url || "").slice(0, 60),
    collect: await race({ command: "collectPageDetailsImmediately" }),
    bogus: await race({ command: "spikeNoSuchCommand" }),
  };
})();
