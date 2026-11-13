export interface DevArgs {
  readonly profile: string | undefined;
  readonly background: boolean;
  /** Everything the dev script does not claim, passed to Electron as typed. */
  readonly electronArgs: string[];
}

export const splitArgs = (
  args: readonly string[],
  env = process.env
): DevArgs => {
  let profile: string | undefined;
  let background = env.MERU_BACKGROUND === "1";
  const electronArgs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--background") {
      background = true;
    } else if (arg === "--profile") {
      index += 1;
      profile = args[index];
      if (profile === undefined) {
        throw new Error("--profile needs a name");
      }
    } else if (arg?.startsWith("--profile=") === true) {
      profile = arg.slice("--profile=".length);
    } else if (arg !== undefined) {
      electronArgs.push(arg);
    }
  }

  return { background, electronArgs, profile };
};
