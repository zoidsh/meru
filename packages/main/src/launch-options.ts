import type { DevServer } from "./content-security-policy.ts";

export interface LaunchOptions {
  /** Open behind whatever is in front, for a desktop other sessions share. */
  background: boolean;
  /** Set in a development build only, which loads the shell from it. */
  devServer: DevServer | undefined;
}

export interface LaunchInput {
  argv: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
  isDevBuild: boolean;
}

const readDevServer = (
  env: LaunchInput["env"],
  isDevBuild: boolean
): DevServer | undefined => {
  if (!isDevBuild) {
    return;
  }

  const url = env.MERU_DEV_SERVER_URL;
  const nonce = env.MERU_DEV_CSP_NONCE;

  if (!(url && nonce)) {
    throw new Error(
      "A development build needs MERU_DEV_SERVER_URL and MERU_DEV_CSP_NONCE; run it with `pnpm dev`."
    );
  }

  return { url, nonce };
};

export const readLaunchOptions = ({
  argv,
  env,
  isDevBuild,
}: LaunchInput): LaunchOptions => ({
  background: env.MERU_BACKGROUND === "1" || argv.includes("--background"),
  devServer: readDevServer(env, isDevBuild),
});
