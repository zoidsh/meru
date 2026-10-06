(async () => {
  const created = await chrome.windows.create({
    url: "popup/index.html?uilocation=popout",
    type: "popup",
    width: 420,
    height: 680,
  });

  return { created, permissions: typeof chrome.permissions };
})();
