// Pure text in and out, kept apart from the module that runs `reg.exe` so a
// unit test needs no Electron

export const MAILTO_PROG_ID = "Meru.mailto";

export const BROWSER_PROG_ID = "Meru.url";

function escapeRegValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function buildRegistration(executablePath: string) {
  const icon = escapeRegValue(`${executablePath},0`);

  const openCommand = escapeRegValue(`"${executablePath}"`);

  const urlCommand = escapeRegValue(`"${executablePath}" "%1"`);

  // The leading `-` deletes `Software\Meru`, the second set of capabilities
  // earlier installers wrote: left behind, Default apps lists two Merus
  const registration = String.raw`Windows Registry Editor Version 5.00

[-HKEY_CURRENT_USER\Software\Meru]

[HKEY_CURRENT_USER\Software\Classes\Meru.mailto]
@="Meru URL"
"FriendlyTypeName"="Meru URL"
"EditFlags"=dword:00000002

[HKEY_CURRENT_USER\Software\Classes\Meru.mailto\DefaultIcon]
@=${icon}

[HKEY_CURRENT_USER\Software\Classes\Meru.mailto\shell\open\command]
@=${urlCommand}

[HKEY_CURRENT_USER\Software\Classes\mailto]
"URL Protocol"=""

[HKEY_CURRENT_USER\Software\Clients\Mail\Meru]
@="Meru"
"LocalizedString"="Meru"

[HKEY_CURRENT_USER\Software\Clients\Mail\Meru\DefaultIcon]
@=${icon}

[HKEY_CURRENT_USER\Software\Clients\Mail\Meru\shell\open\command]
@=${openCommand}

[HKEY_CURRENT_USER\Software\Clients\Mail\Meru\Protocols\mailto]
@="URL:MailTo Protocol"
"URL Protocol"=""
"EditFlags"=dword:00000002

[HKEY_CURRENT_USER\Software\Clients\Mail\Meru\Protocols\mailto\DefaultIcon]
@=${icon}

[HKEY_CURRENT_USER\Software\Clients\Mail\Meru\Protocols\mailto\shell\open\command]
@=${urlCommand}

[HKEY_CURRENT_USER\Software\Clients\Mail\Meru\Capabilities]
"ApplicationName"="Meru"
"ApplicationDescription"="The Gmail experience you deserve"
"ApplicationIcon"=${icon}

[HKEY_CURRENT_USER\Software\Clients\Mail\Meru\Capabilities\StartMenu]
"Mail"="Meru"

[HKEY_CURRENT_USER\Software\Clients\Mail\Meru\Capabilities\URLAssociations]
"mailto"="Meru.mailto"

[HKEY_CURRENT_USER\Software\Classes\Meru.url]
@="Meru Web Link"
"FriendlyTypeName"="Meru Web Link"
"EditFlags"=dword:00000002

[HKEY_CURRENT_USER\Software\Classes\Meru.url\DefaultIcon]
@=${icon}

[HKEY_CURRENT_USER\Software\Classes\Meru.url\shell\open\command]
@=${urlCommand}

[HKEY_CURRENT_USER\Software\Clients\StartMenuInternet\Meru]
@="Meru"
"LocalizedString"="Meru"

[HKEY_CURRENT_USER\Software\Clients\StartMenuInternet\Meru\DefaultIcon]
@=${icon}

[HKEY_CURRENT_USER\Software\Clients\StartMenuInternet\Meru\shell\open\command]
@=${openCommand}

[HKEY_CURRENT_USER\Software\Clients\StartMenuInternet\Meru\Capabilities]
"ApplicationName"="Meru"
"ApplicationDescription"="The Gmail experience you deserve"
"ApplicationIcon"=${icon}

[HKEY_CURRENT_USER\Software\Clients\StartMenuInternet\Meru\Capabilities\StartMenu]
"StartMenuInternet"="Meru"

[HKEY_CURRENT_USER\Software\Clients\StartMenuInternet\Meru\Capabilities\URLAssociations]
"http"="Meru.url"
"https"="Meru.url"

[HKEY_CURRENT_USER\Software\RegisteredApplications]
"Meru"="Software\\Clients\\Mail\\Meru\\Capabilities"
"Meru.url"="Software\\Clients\\StartMenuInternet\\Meru\\Capabilities"
`;

  // `reg.exe import` parses the file as Windows text
  return registration.replace(/\n/g, "\r\n");
}

/**
 * Every `REG_SZ` value in a `reg query` dump except the hash. Windows 11 24H2
 * moved the choice from a `ProgId` value on `UserChoice` to a `ProgId` subkey
 * of `UserChoiceLatest`, so the value's name is not relied on, only its data.
 */
export function parseUserChoiceProgIds(output: string) {
  return [...output.matchAll(/^\s*(?!Hash\s)\S+\s+REG_SZ\s+(\S.*?)\s*$/gm)].map(
    (match) => match[1],
  );
}
