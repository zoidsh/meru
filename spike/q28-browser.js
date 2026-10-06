(() => ({
  hasBrowser: typeof globalThis.browser,
  hasChrome: typeof globalThis.chrome,
  browserRuntimeSendMessage: typeof globalThis.browser?.runtime?.sendMessage,
}))();
