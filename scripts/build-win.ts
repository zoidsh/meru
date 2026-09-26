/*
 * Builds the Windows app, signed only when the release workflow's Azure
 * Artifact Signing credentials are in the environment.
 *
 * electron-builder creates its Azure signing manager whenever
 * `win.azureSignOptions` is set, and off Windows that manager needs a Parallels
 * virtual machine or both pwsh and wine, so a local `build:win` dies before it
 * reaches a target. The option cannot be dropped from the command line, where
 * `-c.win.azureSignOptions=null` arrives as the string "null" and fails schema
 * validation, so the build goes through electron-builder's own argument parser
 * here and the override is appended as one more config layer. Every forwarded
 * flag, `--publish always` and `--config.publish.channel=beta` included, is
 * then parsed exactly as the CLI parses it.
 */
import {
  build,
  type CliOptions,
  configureBuildCommand,
  createYargs,
} from "electron-builder/out/builder";

// Azure Artifact Signing authenticates through the Azure SDK's
// EnvironmentCredential, which reads exactly these three names.
const CREDENTIAL_ENV_VARS = ["AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET"];

const missingEnvVars = CREDENTIAL_ENV_VARS.filter((name) => !process.env[name]);

const args = configureBuildCommand(createYargs()).parse(process.argv.slice(2)) as CliOptions & {
  win?: string[];
};

// `--config` combined with `-c.x=y` overrides already parses into a list of
// layers, which electron-builder merges in order, so the override goes last.
const config = [args.config].flat();

if (missingEnvVars.length > 0) {
  console.log(`Skipping Windows code signing: ${missingEnvVars.join(", ")} not set`);

  config.push({ win: { azureSignOptions: null } });
}

await build({
  ...args,
  win: args.win ?? [],
  config,
} as unknown as CliOptions);
