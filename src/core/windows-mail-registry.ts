/** The class Windows' choice for `mailto` names when the person chose Meru. */
export const MAILTO_PROG_ID = "Meru.mailto";

/**
 * Windows 11 22H2, from which Default apps opens at an app's own page;
 * earlier builds get the list of every app.
 */
const APP_PAGE_BUILD = 22_621;

/** A `.reg` string value: quoted, with its backslashes and quotes escaped. */
const regString = (value: string) =>
  `"${value.replaceAll("\\", "\\\\").replaceAll('"', String.raw`\"`)}"`;

/**
 * The per-user keys that make the executable at `executablePath` one of the
 * apps Default apps offers for `mailto`, as a `.reg` file for `reg import`:
 * the `Meru.mailto` class that opens a link, `Clients\Mail\Meru` with its
 * capabilities and their one URL association, and Meru's entry under
 * `RegisteredApplications`. Importing it again changes nothing, and it holds
 * no web link association.
 */
export const windowsMailRegistration = (executablePath: string) => {
  const icon = regString(`${executablePath},0`);
  const openLink = regString(`"${executablePath}" "%1"`);
  const open = regString(`"${executablePath}"`);

  return [
    "Windows Registry Editor Version 5.00",
    "",
    String.raw`[HKEY_CURRENT_USER\Software\Classes\Meru.mailto]`,
    '@="Meru Email Link"',
    '"FriendlyTypeName"="Meru Email Link"',
    "",
    String.raw`[HKEY_CURRENT_USER\Software\Classes\Meru.mailto\DefaultIcon]`,
    `@=${icon}`,
    "",
    String.raw`[HKEY_CURRENT_USER\Software\Classes\Meru.mailto\shell\open\command]`,
    `@=${openLink}`,
    "",
    String.raw`[HKEY_CURRENT_USER\Software\Clients\Mail\Meru]`,
    '@="Meru"',
    "",
    String.raw`[HKEY_CURRENT_USER\Software\Clients\Mail\Meru\shell\open\command]`,
    `@=${open}`,
    "",
    String.raw`[HKEY_CURRENT_USER\Software\Clients\Mail\Meru\Capabilities]`,
    '"ApplicationName"="Meru"',
    '"ApplicationDescription"="The Gmail experience you deserve"',
    `"ApplicationIcon"=${icon}`,
    "",
    String.raw`[HKEY_CURRENT_USER\Software\Clients\Mail\Meru\Capabilities\URLAssociations]`,
    `"mailto"="${MAILTO_PROG_ID}"`,
    "",
    String.raw`[HKEY_CURRENT_USER\Software\RegisteredApplications]`,
    String.raw`"Meru"="Software\\Clients\\Mail\\Meru\\Capabilities"`,
    "",
  ].join("\r\n");
};

/**
 * The class each `REG_SZ` value of a `reg query` of a choice key names, the
 * hash left out. Windows 11 24H2 keeps the choice as a `ProgId` subkey of
 * `UserChoiceLatest` rather than a value of `UserChoice`, so no value's name
 * is relied on.
 */
export const choiceProgIds = (output: string) =>
  [
    ...output.matchAll(/^\s*(?!Hash\s)\S+\s+REG_SZ\s+(?<progId>\S.*?)\s*$/gmu),
  ].map((match) => match.groups?.progId ?? "");

/**
 * Whether the person chose Meru for `mailto`, from `reg query` of
 * `UserChoiceLatest` and of `UserChoice`; the newer key, which Windows 11
 * 24H2 writes while leaving the older stale, answers whenever it holds one.
 */
export const choseMeruForMail = (latest: string, legacy: string) => {
  const newer = choiceProgIds(latest);

  return (newer.length > 0 ? newer : choiceProgIds(legacy)).includes(
    MAILTO_PROG_ID
  );
};

/** Default apps, at Meru's own page where the build has one. */
export const defaultAppsUrl = (osRelease: string) =>
  Number(osRelease.split(".")[2]) >= APP_PAGE_BUILD
    ? "ms-settings:defaultapps?registeredAppUser=Meru"
    : "ms-settings:defaultapps";
