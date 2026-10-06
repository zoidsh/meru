(async () => {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all);

  const pick = (pattern) =>
    Object.fromEntries(
      keys
        .filter((key) => pattern.test(key))
        .map((key) => [key, JSON.stringify(all[key]).slice(0, 220)]),
    );

  return {
    keyCount: keys.length,
    account: pick(/account/i),
    authStatus: pick(/authenticationStatus|auth_/i),
    environment: pick(/environment/i),
  };
})();
