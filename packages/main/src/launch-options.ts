export interface LaunchOptions {
  /** Open behind whatever is in front, for a desktop other sessions share. */
  background: boolean;
}

export const readLaunchOptions = ({
  argv,
  env,
}: {
  argv: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
}): LaunchOptions => ({
  background: env.MERU_BACKGROUND === "1" || argv.includes("--background"),
});
