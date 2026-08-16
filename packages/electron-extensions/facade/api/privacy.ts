import type { ChromeNamespace } from "../lib/chrome";
import { createNoopEvent } from "../lib/event";
import { createNoopMethod } from "../lib/method";

/**
 * Chrome's privacy settings describe browser features an embedder built on
 * Electron does not have — password saving, autofill, safe browsing — so every
 * setting reports itself as out of the extension's reach and writes go nowhere.
 * The reported values are placeholders of the right type, not measurements.
 */
function createSetting(value: unknown): ChromeNamespace {
  return {
    get: createNoopMethod(() => ({ value, levelOfControl: "not_controllable" })),
    set: createNoopMethod(() => undefined),
    clear: createNoopMethod(() => undefined),
    onChange: createNoopEvent(),
  };
}

function createSettings(values: Record<string, unknown>): ChromeNamespace {
  const settings: ChromeNamespace = {};

  for (const [settingName, value] of Object.entries(values)) {
    settings[settingName] = createSetting(value);
  }

  return settings;
}

export function createPrivacy(): ChromeNamespace {
  return {
    network: createSettings({
      networkPredictionEnabled: false,
      webRTCIPHandlingPolicy: "default",
    }),
    services: createSettings({
      alternateErrorPagesEnabled: false,
      autofillAddressEnabled: false,
      autofillCreditCardEnabled: false,
      passwordSavingEnabled: false,
      safeBrowsingEnabled: false,
      safeBrowsingExtendedReportingEnabled: false,
      searchSuggestEnabled: false,
      spellingServiceEnabled: false,
      translationServiceEnabled: false,
    }),
    websites: createSettings({
      adMeasurementEnabled: false,
      doNotTrackEnabled: false,
      fledgeEnabled: false,
      hyperlinkAuditingEnabled: false,
      protectedContentEnabled: false,
      referrersEnabled: false,
      relatedWebsiteSetsEnabled: false,
      thirdPartyCookiesAllowed: false,
      topicsEnabled: false,
    }),
  };
}
