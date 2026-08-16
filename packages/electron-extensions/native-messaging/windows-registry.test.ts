import { describe, expect, test } from "bun:test";
import { WINDOWS_HOST_REGISTRY_KEYS } from "./host-manifest";
import { parseRegistryQueryOutput } from "./windows-registry";

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

  test("reads an expandable string value too", () => {
    expect(
      parseRegistryQueryOutput("    (Default)    REG_EXPAND_SZ    %LOCALAPPDATA%\\host.json\r\n"),
    ).toBe("%LOCALAPPDATA%\\host.json");
  });

  test("keeps a path with spaces in it whole", () => {
    expect(
      parseRegistryQueryOutput("    (Default)    REG_SZ    C:\\Program Files\\1Password\\h.json"),
    ).toBe("C:\\Program Files\\1Password\\h.json");
  });

  test("ignores a value that is not a string", () => {
    expect(parseRegistryQueryOutput("    (Default)    REG_DWORD    0x1")).toBeUndefined();
  });

  test("answers with nothing when the key has no default value", () => {
    expect(
      parseRegistryQueryOutput(
        "\r\nHKEY_CURRENT_USER\\Software\\Google\\Chrome\\NativeMessagingHosts\r\n",
      ),
    ).toBeUndefined();
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
