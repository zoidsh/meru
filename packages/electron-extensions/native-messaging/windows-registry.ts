import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * The manifest path out of `reg query <key> /ve`, which prints the key it read
 * and then the default value as name, type and data separated by runs of
 * spaces. Only a string value is a path; anything else is a registration this
 * code has no business following.
 *
 *     HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.1password.1password
 *         (Default)    REG_SZ    C:\Users\me\AppData\Local\1Password\com.1password.1password.json
 */
export function parseRegistryQueryOutput(output: string) {
  for (const line of output.split(/\r?\n/)) {
    const value = /^\s+\(Default\)\s+REG_(?:SZ|EXPAND_SZ)\s+(.+?)\s*$/.exec(line);

    if (value?.[1]) {
      return value[1];
    }
  }

  return undefined;
}

async function queryRegistryValue(key: string) {
  try {
    const { stdout } = await execFileAsync("reg.exe", ["query", key, "/ve"], {
      windowsHide: true,
    });

    return parseRegistryQueryOutput(stdout);
  } catch {
    // An unregistered host is a missing key, which `reg` reports as an error
    return undefined;
  }
}

/**
 * Windows has no manifest directories to walk: each registered host is a
 * registry key whose default value holds the path of its manifest.
 */
export async function queryWindowsRegistryHostManifestPaths(
  hostName: string,
  registryKeys: string[],
) {
  const manifestPaths: string[] = [];

  for (const registryKey of registryKeys) {
    const manifestPath = await queryRegistryValue(`${registryKey}\\${hostName}`);

    if (manifestPath) {
      manifestPaths.push(manifestPath);
    }
  }

  return manifestPaths;
}
