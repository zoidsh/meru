/** What the Email links row says under its label. */
export type EmailLinksDescription =
  /** macOS and Linux: Meru asks which profile writes. */
  | "asks"
  /** Windows, before Meru is chosen: where to choose it. */
  | "choose-in-windows"
  /** Windows, once Meru is chosen. */
  | "meru-opens"
  /** Linux, once on, which Meru cannot turn off. */
  | "meru-opens-change-in-system"
  /** A build that only pretends, which can open none. */
  | "development";

export interface EmailLinksRow {
  /** A switch on macOS and Linux, a button to Windows Settings on Windows. */
  control: "switch" | "button";
  checked: boolean;
  disabled: boolean;
  description: EmailLinksDescription;
}

/**
 * The Email links row on `platform` (`document.documentElement`'s
 * `data-platform`), from whether the system sends email links to Meru,
 * whether this build is a release's and whether it lacks Meru Pro.
 */
export const emailLinksRow = ({
  platform,
  isDefault,
  real,
  needsPro,
}: {
  platform: string | undefined;
  isDefault: boolean;
  real: boolean;
  needsPro: boolean;
}): EmailLinksRow => {
  const control = platform === "win32" ? "button" : "switch";

  if (!real) {
    return {
      control,
      checked: false,
      disabled: true,
      description: "development",
    };
  }

  if (control === "button") {
    return {
      control,
      checked: isDefault,
      disabled: needsPro,
      description: isDefault ? "meru-opens" : "choose-in-windows",
    };
  }

  // Linux gives the links back to no other app, so on stays on.
  const stuck = platform === "linux" && isDefault;

  return {
    control,
    checked: isDefault,
    disabled: needsPro || stuck,
    description: stuck ? "meru-opens-change-in-system" : "asks",
  };
};
