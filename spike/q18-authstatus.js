(async () => {
  const ask = (message) =>
    new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve({
          response: response === undefined ? "undefined" : response,
          lastError: chrome.runtime.lastError?.message ?? null,
        });
      });
    });

  return {
    bgGetAuthStatus: await ask({ command: "bgGetAuthStatus" }),
    checkAuthStatus: await ask({ command: "checkAuthStatus" }),
    trigger: await ask({ command: "triggerAutofillScriptInjection" }),
    openUnlockPopout: null,
  };
})();
