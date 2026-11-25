import { t } from "@lingui/core/macro";

import type { Clipboard } from "#platform/clipboard.ts";
import type {
  DefaultBrowser,
  DefaultBrowserAlert,
  WebScheme,
} from "#platform/default-browser.ts";
import type { SystemBrowser } from "#platform/system-browser.ts";

/**
 * The link's own scheme, since the system can hand `http` and `https` to
 * different browsers; none for any other, which never reaches a browser.
 */
const webScheme = (url: string): WebScheme | undefined => {
  const protocol = URL.parse(url)?.protocol;

  if (protocol === "http:") {
    return "http";
  }

  return protocol === "https:" ? "https" : undefined;
};

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const copyButton = () => ({
  choice: "copy" as const,
  label: t({
    message: "Copy Link",
    comment:
      "Button in the alert saying Meru is the default browser, which copies the link that could not open",
  }),
});

/** With the system's one place to choose a browser, as macOS has, or none, as Linux. */
const alertFor = (withSettings: boolean): DefaultBrowserAlert => {
  const message = t({
    message: "Meru is your default browser",
    comment:
      "Title of the alert Meru shows in place of opening a link in the default browser, since Meru itself is the system's default browser",
  });

  return withSettings
    ? {
        message,
        detail: t({
          message:
            "Links can't leave Meru while it's your default browser. Choose another default browser in System Settings to open them.",
          comment:
            "Detail of the alert saying Meru is the default browser, on macOS; System Settings is macOS's app of that name",
        }),
        buttons: [
          {
            choice: "settings",
            label: t({
              message: "Open System Settings",
              comment:
                "Button in the alert saying Meru is the default browser, on macOS, which opens where macOS's default browser is chosen",
            }),
          },
          copyButton(),
          {
            choice: "cancel",
            label: t({
              message: "Cancel",
              comment:
                "Button in the alert saying Meru is the default browser, which opens nothing",
            }),
          },
        ],
      }
    : {
        message,
        detail: t({
          message:
            "Links can't leave Meru while it's your default browser. Choose another default browser in your system settings to open them.",
          comment:
            "Detail of the alert saying Meru is the default browser, on Linux",
        }),
        buttons: [
          copyButton(),
          {
            choice: "cancel",
            label: t({
              message: "OK",
              comment:
                "Button in the alert saying Meru is the default browser, on Linux, which closes it and opens nothing",
            }),
          },
        ],
      };
};

/**
 * Stops a link leaving for the default browser while Meru is it, which
 * would only hand the link back to Meru: v3 found that presents as a hang.
 * The alert says so in its place and offers the system's settings, where
 * there is one place for them, or a copy of the link. A build that claims no
 * link scheme has no `defaultBrowser` and holds nothing.
 */
export const createDefaultBrowserGuard = ({
  defaultBrowser,
  clipboard,
  log,
}: {
  defaultBrowser: DefaultBrowser | undefined;
  clipboard: Clipboard;
  log: (message: string) => void;
}) => {
  /** Whether the link stays, the alert shown and answered. */
  const holds = async (url: string) => {
    const scheme = webScheme(url);

    if (!scheme || !defaultBrowser?.isMeru(scheme)) {
      return false;
    }

    const { openSettings } = defaultBrowser;
    const choice = await defaultBrowser.alert(
      alertFor(openSettings !== undefined)
    );

    try {
      if (choice === "copy") {
        await clipboard.writeText(url);
      } else if (choice === "settings") {
        await openSettings?.();
      }
    } catch (error) {
      log(`The default browser alert's ${choice} failed: ${describe(error)}`);
    }

    return true;
  };

  return {
    holds,
    /** The system browser, guarded. */
    guard: (systemBrowser: SystemBrowser): SystemBrowser => ({
      open: async (url) => {
        if (!(await holds(url))) {
          await systemBrowser.open(url);
        }
      },
    }),
  };
};

export type DefaultBrowserGuard = ReturnType<typeof createDefaultBrowserGuard>;
