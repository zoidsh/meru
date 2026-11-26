import { describe, expect, it } from "vitest";

import {
  choiceProgIds,
  choseMeruForMail,
  defaultAppsUrl,
  windowsMailRegistration,
} from "./windows-mail-registry.ts";

const INSTALLED = String.raw`C:\Users\Ana\AppData\Local\Programs\Meru\Meru.exe`;
const PORTABLE = String.raw`D:\Tools\Meru 4.0.0.exe`;

const KEY = String.raw`HKEY_CURRENT_USER\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\mailto`;

/** `reg query <key> /s` of a `UserChoice` key, as Windows 10 and 11 print it. */
const legacy = (progId: string) =>
  [
    "",
    String.raw`${KEY}\UserChoice`,
    "    Hash    REG_SZ    q1w2e3r4t5Y=",
    `    ProgId    REG_SZ    ${progId}`,
    "",
  ].join("\r\n");

/** The same of `UserChoiceLatest`, whose choice Windows 11 24H2 keeps in a subkey. */
const latest = (progId: string) =>
  [
    "",
    String.raw`${KEY}\UserChoiceLatest`,
    "    Hash    REG_SZ    z9x8c7v6=",
    "",
    String.raw`${KEY}\UserChoiceLatest\ProgId`,
    `    ProgId    REG_SZ    ${progId}`,
    "",
  ].join("\r\n");

describe(windowsMailRegistration, () => {
  it("registers the installed executable for mailto alone, as Windows text", () => {
    expect(windowsMailRegistration(INSTALLED)).toBe(
      [
        "Windows Registry Editor Version 5.00",
        "",
        String.raw`[HKEY_CURRENT_USER\Software\Classes\Meru.mailto]`,
        '@="Meru Email Link"',
        '"FriendlyTypeName"="Meru Email Link"',
        "",
        String.raw`[HKEY_CURRENT_USER\Software\Classes\Meru.mailto\DefaultIcon]`,
        String.raw`@="C:\\Users\\Ana\\AppData\\Local\\Programs\\Meru\\Meru.exe,0"`,
        "",
        String.raw`[HKEY_CURRENT_USER\Software\Classes\Meru.mailto\shell\open\command]`,
        String.raw`@="\"C:\\Users\\Ana\\AppData\\Local\\Programs\\Meru\\Meru.exe\" \"%1\""`,
        "",
        String.raw`[HKEY_CURRENT_USER\Software\Clients\Mail\Meru]`,
        '@="Meru"',
        "",
        String.raw`[HKEY_CURRENT_USER\Software\Clients\Mail\Meru\shell\open\command]`,
        String.raw`@="\"C:\\Users\\Ana\\AppData\\Local\\Programs\\Meru\\Meru.exe\""`,
        "",
        String.raw`[HKEY_CURRENT_USER\Software\Clients\Mail\Meru\Capabilities]`,
        '"ApplicationName"="Meru"',
        '"ApplicationDescription"="The Gmail experience you deserve"',
        String.raw`"ApplicationIcon"="C:\\Users\\Ana\\AppData\\Local\\Programs\\Meru\\Meru.exe,0"`,
        "",
        String.raw`[HKEY_CURRENT_USER\Software\Clients\Mail\Meru\Capabilities\URLAssociations]`,
        '"mailto"="Meru.mailto"',
        "",
        String.raw`[HKEY_CURRENT_USER\Software\RegisteredApplications]`,
        String.raw`"Meru"="Software\\Clients\\Mail\\Meru\\Capabilities"`,
        "",
      ].join("\r\n")
    );
  });

  it("names the portable file itself, its spaces kept inside the quotes", () => {
    const registration = windowsMailRegistration(PORTABLE);

    expect(registration).toContain(
      String.raw`@="\"D:\\Tools\\Meru 4.0.0.exe\" \"%1\""`
    );
    expect(registration).toContain(
      String.raw`"ApplicationIcon"="D:\\Tools\\Meru 4.0.0.exe,0"`
    );
    expect(registration).not.toContain(INSTALLED.replaceAll("\\", "\\\\"));
  });

  it("claims no web links and ends every line as Windows does", () => {
    const registration = windowsMailRegistration(INSTALLED);

    expect(registration).not.toMatch(/https?"|StartMenuInternet/u);
    expect(registration.replaceAll("\r\n", "")).not.toContain("\n");
  });
});

describe(choiceProgIds, () => {
  it("reads every class named, never the hash", () => {
    expect(choiceProgIds(legacy("Meru.mailto"))).toStrictEqual(["Meru.mailto"]);
    expect(
      choiceProgIds(latest("AppXydk58wgm44se4b399k9ye2m8pz8fyq6q"))
    ).toStrictEqual(["AppXydk58wgm44se4b399k9ye2m8pz8fyq6q"]);
    expect(choiceProgIds("")).toStrictEqual([]);
  });
});

describe(choseMeruForMail, () => {
  it("answers from UserChoice where Windows keeps no newer choice", () => {
    expect(choseMeruForMail("", legacy("Meru.mailto"))).toBeTruthy();
    expect(choseMeruForMail("", legacy("Outlook.URL.mailto.15"))).toBeFalsy();
  });

  it("lets UserChoiceLatest answer over a stale UserChoice", () => {
    expect(
      choseMeruForMail(latest("Meru.mailto"), legacy("Outlook.URL.mailto.15"))
    ).toBeTruthy();
    expect(
      choseMeruForMail(latest("Outlook.URL.mailto.15"), legacy("Meru.mailto"))
    ).toBeFalsy();
  });

  it("answers no where the person chose nothing", () => {
    expect(choseMeruForMail("", "")).toBeFalsy();
  });
});

describe(defaultAppsUrl, () => {
  it("opens at Meru's own page from Windows 11 22H2", () => {
    expect(defaultAppsUrl("10.0.22621")).toBe(
      "ms-settings:defaultapps?registeredAppUser=Meru"
    );
    expect(defaultAppsUrl("10.0.26100")).toBe(
      "ms-settings:defaultapps?registeredAppUser=Meru"
    );
  });

  it("opens the list on older builds", () => {
    expect(defaultAppsUrl("10.0.22000")).toBe("ms-settings:defaultapps");
    expect(defaultAppsUrl("10.0.19045")).toBe("ms-settings:defaultapps");
  });
});
