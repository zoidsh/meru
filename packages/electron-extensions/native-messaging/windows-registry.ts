import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * `reg` is resolved out of the system directory rather than off the search
 * path, so that whatever else is named `reg.exe` on this machine can't stand in
 * for it.
 */
const REG_EXECUTABLE_PATH = path.join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32",
  "reg.exe",
);

/**
 * What Windows does to a `REG_EXPAND_SZ` value when it is read: every
 * `%NAME%` becomes the environment variable's value, matched without regard to
 * case the way Windows matches them, and a name nothing is set for stays as
 * written. `reg query` prints the value unexpanded, so a host registered under
 * `%LocalAppData%` needs this to come out as a readable path.
 */
export function expandEnvironmentVariables(
  value: string,
  environment: Record<string, string | undefined> = process.env,
) {
  const valuesByLowerCaseName = new Map(
    Object.entries(environment).map(([name, variableValue]) => [name.toLowerCase(), variableValue]),
  );

  return value.replace(
    /%([^%]+)%/g,
    (reference, name: string) => valuesByLowerCaseName.get(name.toLowerCase()) ?? reference,
  );
}

/**
 * The manifest path out of `reg query <key> /ve`, which prints the key it read
 * and then the default value as name, type and data separated by runs of
 * spaces. `reg` localizes the name of that value — German Windows prints
 * `(Standard)`, French `(par défaut)` with a space in it — so the line is
 * recognized by its type column instead, which is unambiguous because `/ve`
 * prints exactly one value. Only a string value is a path; anything else is a
 * registration this code has no business following.
 *
 *     HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.1password.1password
 *         (Default)    REG_SZ    C:\Users\me\AppData\Local\1Password\com.1password.1password.json
 */
export function parseRegistryQueryOutput(
  output: string,
  environment?: Record<string, string | undefined>,
) {
  for (const line of output.split(/\r?\n/)) {
    const value = /^\s+.+?\s+(REG_SZ|REG_EXPAND_SZ)\s+(.+?)\s*$/.exec(line);

    if (value?.[2]) {
      return value[1] === "REG_EXPAND_SZ"
        ? expandEnvironmentVariables(value[2], environment)
        : value[2];
    }
  }

  return undefined;
}

async function queryRegistryValue(key: string) {
  try {
    const { stdout } = await execFileAsync(REG_EXECUTABLE_PATH, ["query", key, "/ve"], {
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
