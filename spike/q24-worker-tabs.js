(async () => {
  const tabs = await chrome.tabs.query({});

  const results = [];

  for (const tab of tabs) {
    if (!/accounts\.google\.com/.test(tab.url ?? "")) {
      continue;
    }

    const ask = (message) =>
      new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, message, (response) => {
          resolve({
            response: response === undefined ? "undefined" : response,
            lastError: chrome.runtime.lastError?.message ?? null,
          });
        });
      });

    results.push({
      tab: { id: tab.id, url: (tab.url ?? "").slice(0, 60), active: tab.active },
      collect: await ask({ command: "collectPageDetailsImmediately" }),
      ping: await ask({ command: "bgUnlockPopoutOpened" }),
    });
  }

  return { tabCount: tabs.length, urls: tabs.map((tab) => (tab.url ?? "").slice(0, 50)), results };
})();
