/** The class Windows' choice for `mailto` names when the person chose Meru. */
export const MAILTO_PROG_ID = "Meru.mailto";

/**
 * Windows 11 22H2, from which Default apps opens at an app's own page;
 * earlier builds get the list of every app.
 */
const APP_PAGE_BUILD = 22_621;

// A `.reg` string escapes only `\` and `"`, as JSON does; JSON's other
// escapes are for control characters, which no Windows path can hold.
const regString = (value: string) => JSON.stringify(value);

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

const PROG_ID_VALUE = "ProgId";
const STRING_TYPE = "REG_SZ";

/**
 * Every `ProgId` string in what `reg query /s` prints, a line of name, type
 * and data per value, the subkeys searched too. Only that value's name is
 * read: a key's unnamed value prints in the system's language with a
 * translated "not set" as its data, which must never pass for a choice.
 */
export const choiceProgIds = (output: string) =>
  output.split(/\r?\n/u).flatMap((line) => {
    const [name, type, ...data] = line.trim().split(/\s+/u);

    return name === PROG_ID_VALUE && type === STRING_TYPE && data.length > 0
      ? [data.join(" ")]
      : [];
  });

/**
 * Whether the person chose Meru for `mailto`, from `reg query` of
 * `UserChoiceLatest` and of `UserChoice`. Where both hold a choice they can
 * disagree, and the newer key is the one Windows acts on.
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
