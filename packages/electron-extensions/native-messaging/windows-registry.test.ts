import { describe, expect, test } from "bun:test";
import { WINDOWS_HOST_REGISTRY_KEYS } from "./host-manifest";
import { expandEnvironmentVariables, parseRegistryQueryOutput } from "./windows-registry";

describe("parseRegistryQueryOutput", () => {
  test("reads the manifest path out of a default string value", () => {
    expect(
      parseRegistryQueryOutput(
        [
          "",
          "HKEY_CURRENT_USER\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.1password.1password",
          "    (Default)    REG_SZ    C:\\Users\\Tim\\AppData\\Local\\1Password\\com.1password.1password.json",
          "",
        ].join("\r\n"),
      ),
    ).toBe("C:\\Users\\Tim\\AppData\\Local\\1Password\\com.1password.1password.json");
  });

  test("expands an expandable string value the way Windows reads it", () => {
    expect(
      parseRegistryQueryOutput("    (Default)    REG_EXPAND_SZ    %LOCALAPPDATA%\\host.json\r\n", {
        LOCALAPPDATA: "C:\\Users\\Tim\\AppData\\Local",
      }),
    ).toBe("C:\\Users\\Tim\\AppData\\Local\\host.json");
  });

  test("expands nothing in an ordinary string value", () => {
    expect(
      parseRegistryQueryOutput("    (Default)    REG_SZ    %LOCALAPPDATA%\\host.json", {
        LOCALAPPDATA: "C:\\Users\\Tim\\AppData\\Local",
      }),
    ).toBe("%LOCALAPPDATA%\\host.json");
  });

  test("keeps a path with spaces in it whole", () => {
    expect(
      parseRegistryQueryOutput("    (Default)    REG_SZ    C:\\Program Files\\1Password\\h.json"),
    ).toBe("C:\\Program Files\\1Password\\h.json");
  });

  test("reads the manifest path when Windows localizes the value name", () => {
    expect(
      parseRegistryQueryOutput(
        [
          "",
          "HKEY_CURRENT_USER\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.1password.1password",
          "    (Standard)    REG_SZ    C:\\Users\\Tim\\AppData\\Local\\1Password\\com.1password.1password.json",
          "",
        ].join("\r\n"),
      ),
    ).toBe("C:\\Users\\Tim\\AppData\\Local\\1Password\\com.1password.1password.json");
  });

  test("reads the manifest path when the localized value name has a space in it", () => {
    expect(
      parseRegistryQueryOutput(
        "    (par défaut)    REG_SZ    C:\\Program Files\\1Password\\host.json\r\n",
      ),
    ).toBe("C:\\Program Files\\1Password\\host.json");
  });

  test("expands an expandable string value under a localized value name", () => {
    expect(
      parseRegistryQueryOutput("    (Standard)    REG_EXPAND_SZ    %LOCALAPPDATA%\\host.json", {
        LOCALAPPDATA: "C:\\Users\\Tim\\AppData\\Local",
      }),
    ).toBe("C:\\Users\\Tim\\AppData\\Local\\host.json");
  });

  test("ignores a value that is not a string", () => {
    expect(parseRegistryQueryOutput("    (Default)    REG_DWORD    0x1")).toBeUndefined();
  });

  test("ignores a value that is not a string under a localized value name", () => {
    expect(parseRegistryQueryOutput("    (Standard)    REG_DWORD    0x1")).toBeUndefined();
  });

  test("answers with nothing when the key has no default value", () => {
    expect(
      parseRegistryQueryOutput(
        "\r\nHKEY_CURRENT_USER\\Software\\Google\\Chrome\\NativeMessagingHosts\r\n",
      ),
    ).toBeUndefined();
  });
});

describe("expandEnvironmentVariables", () => {
  test("matches variable names without regard to case", () => {
    expect(
      expandEnvironmentVariables("%localappdata%\\host.json", {
        LOCALAPPDATA: "C:\\Users\\Tim\\AppData\\Local",
      }),
    ).toBe("C:\\Users\\Tim\\AppData\\Local\\host.json");
  });

  test("leaves a reference nothing is set for as written", () => {
    expect(expandEnvironmentVariables("%NOT_SET%\\host.json", {})).toBe("%NOT_SET%\\host.json");
  });

  test("expands several references in one value", () => {
    expect(
      expandEnvironmentVariables("%SystemDrive%%HOMEPATH%\\host.json", {
        SystemDrive: "C:",
        HOMEPATH: "\\Users\\Tim",
      }),
    ).toBe("C:\\Users\\Tim\\host.json");
  });
});

describe("WINDOWS_HOST_REGISTRY_KEYS", () => {
  test("asks the user hive before the machine hive", () => {
    const firstMachineKey = WINDOWS_HOST_REGISTRY_KEYS.findIndex((key) => key.startsWith("HKLM"));

    expect(
      WINDOWS_HOST_REGISTRY_KEYS.slice(0, firstMachineKey).every((key) => key.startsWith("HKCU")),
    ).toBe(true);
    expect(WINDOWS_HOST_REGISTRY_KEYS).toContain(
      "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts",
    );
    expect(WINDOWS_HOST_REGISTRY_KEYS).toContain(
      "HKLM\\Software\\Google\\Chrome\\NativeMessagingHosts",
    );
  });
});
