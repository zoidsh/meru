(async () => {
  const all = await chrome.storage.local.get(null);
  return Object.fromEntries(
    Object.keys(all)
      .filter((key) => /autofill|inlineMenu|overlay|notification/i.test(key))
      .map((key) => [key, JSON.stringify(all[key]).slice(0, 200)]),
  );
})();
