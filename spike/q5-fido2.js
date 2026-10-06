(() => ({
  url: location.href,
  createSource: String(navigator.credentials.create),
  getSource: String(navigator.credentials.get),
  isNative: String(navigator.credentials.create).includes("[native code]"),
  hasBwMarker: Object.keys(window).filter((key) => /bitwarden|fido|webauthn/i.test(key)),
}))();
