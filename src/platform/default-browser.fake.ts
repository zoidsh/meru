import type {
  DefaultBrowser,
  DefaultBrowserAlert,
  DefaultBrowserChoice,
  WebScheme,
} from "./default-browser.ts";

/**
 * A system whose default browser is Meru while `isDefault` is, answering
 * each alert with `answer` and keeping what it was asked; with
 * `withSettings`, one place to choose a browser, as macOS has.
 */
export const fakeDefaultBrowser = ({ withSettings = true } = {}) => {
  const fake = {
    isDefault: false,
    /** The one scheme Meru is the default for, else both. */
    onlyFor: undefined as WebScheme | undefined,
    answer: "cancel" as DefaultBrowserChoice,
    asked: [] as DefaultBrowserAlert[],
    settingsOpened: 0,
  };
  const defaultBrowser: DefaultBrowser = {
    isMeru: (scheme) => fake.isDefault && (fake.onlyFor ?? scheme) === scheme,
    alert: (alert) => {
      fake.asked.push(alert);

      return Promise.resolve(fake.answer);
    },
    ...(withSettings
      ? {
          openSettings: () => {
            fake.settingsOpened += 1;

            return Promise.resolve();
          },
        }
      : {}),
  };

  return { fake, defaultBrowser };
};
