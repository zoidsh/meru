import { rm, watch } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { type ParseArgsConfig, parseArgs } from "node:util";
import postcssTailwind from "@tailwindcss/postcss";
import viteTailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { type Subprocess, spawn } from "bun";
import postcss from "postcss";
import { rolldown, defineConfig as defineRolldownConfig } from "rolldown";
import * as vite from "vite";
import {
  defaultUserDataDir,
  parseDevToolsActivePort,
  resolveRendererPort,
  resolveWorktreeProfile,
} from "./lib/dev-run";

const options = {
  dev: {
    type: "boolean",
  },
  devtools: {
    type: "boolean",
    short: "d",
  },
  // Opens Chromium's remote debugging port on the development app, so that a
  // CDP client such as Playwright can drive it: `bun run dev --debug-port 9222`.
  // `--debug-port 0` leaves the choice to Chromium and prints what it picked,
  // which is what two runs at once want, since neither can claim a number the
  // other might have taken.
  "debug-port": {
    type: "string",
  },
  // Runs the development app on `.meru/<name>` instead of the default user
  // data directory, so a signed-in account or a scratch install survives
  // independently of it: `bun run dev --profile signin`. A run in a linked
  // worktree takes one named after its branch when this is not given.
  profile: {
    type: "string",
  },
} satisfies NonNullable<ParseArgsConfig["options"]>;

const args = parseArgs({
  args: Bun.argv,
  options,
  // Any option not declared above goes to Electron as it was typed, so a
  // Chromium flag such as `--disable-gpu` or `--lang=de` needs no entry here.
  strict: false,
  tokens: true,
  allowPositionals: true,
});

const electronArgs = args.tokens.flatMap((token) =>
  token.kind === "option" && !(token.name in options)
    ? [token.value === undefined ? token.rawName : `${token.rawName}=${token.value}`]
    : [],
);

/** Where a named profile's user data directory lives. */
const PROFILES_DIR = ".meru";

const USER_DATA_DIR_OPTION = "--user-data-dir=";

/*
 * A directory the run named itself, which reaches Electron as an option this
 * script never declared. Nothing defaults over it: the switch this script adds
 * goes on the end of the command line, where Chromium would read it in
 * preference to the one that was typed.
 */
const namedUserDataDir = electronArgs
  .find((electronArg) => electronArg.startsWith(USER_DATA_DIR_OPTION))
  ?.slice(USER_DATA_DIR_OPTION.length);

function git(...gitArgs: string[]) {
  const { exitCode, stdout } = Bun.spawnSync(["git", ...gitArgs], { stderr: "ignore" });

  return exitCode === 0 ? stdout.toString().trim() : "";
}

/**
 * The profile this run uses, which is the one it was given, or the one a linked
 * worktree gets so that its run does not share a single instance lock with the
 * run in another worktree.
 *
 * Asked of git rather than inferred from the directory, because a worktree is
 * wherever it was made and only git knows which checkout is the main one. A
 * checkout with no git at all — an archive, a container copy — answers nothing
 * and is treated as the main checkout.
 */
function resolveProfile() {
  if (typeof args.values.profile === "string") {
    return args.values.profile;
  }

  if (namedUserDataDir) {
    return undefined;
  }

  const [gitDir, gitCommonDir, toplevel] = git(
    "rev-parse",
    "--git-dir",
    "--git-common-dir",
    "--show-toplevel",
  ).split("\n");

  if (!gitDir || !gitCommonDir || !toplevel) {
    return undefined;
  }

  return resolveWorktreeProfile({
    gitDir,
    gitCommonDir,
    toplevel,
    branch: git("symbolic-ref", "--quiet", "--short", "HEAD") || undefined,
  });
}

const profile = args.values.dev ? resolveProfile() : undefined;

if (profile) {
  electronArgs.push(`--user-data-dir=${path.resolve(PROFILES_DIR, profile)}`);
}

// Read before anything is built, so that a port nothing can serve on is a line
// of output rather than a failure halfway through a bundle.
const rendererPort = resolveRendererPort(process.env.PORT);

await rm("./build-js", { recursive: true, force: true });

// Keep in sync with Electron
const browserTarget = "chrome146";

/*
 * How the app's own bundles are minified: the main process, the three preloads
 * and the fixture extension's scripts. The extension scripts below are minified
 * unconditionally instead, for a reason of their own.
 *
 * Names are kept, which costs a little of the win and buys back the thing
 * minifying a main-process bundle otherwise takes away. `log.error` writes a
 * serialized error, stack and all, into a log file a user attaches to an issue,
 * and V8 names a frame after the identifier the function was declared under —
 * so mangling turns `readConfigFileSynchronously` into `t` in every report that
 * ever reaches us. No source map ships: it would be larger than the bundle it
 * explains, which is the opposite of the point, and keeping the names leaves
 * the frames legible without one.
 *
 * Development builds are left alone. Nothing about a development run is what
 * ships — the renderer is a Vite dev server there — and the main process is the
 * half a developer sets breakpoints in.
 */
const appBundleMinify = args.values.dev ? false : { mangle: { keepNames: true } };

function buildAppFiles() {
  const rolldownOptions = defineRolldownConfig({
    external: ["electron"],
    transform: {
      define: !args.values.dev
        ? {
            "process.env.NODE_ENV": JSON.stringify("production"),
            /*
             * Defined whether or not it is set, unlike the team id below. A
             * define added only when its variable happens to be set leaves the
             * expression itself in the bundle, where the environment answers it
             * at launch — which let a shipped app be pointed at any license
             * server with one variable. An empty string is what the client
             * reads as "use the production URL".
             */
            "process.env.MERU_API_URL": JSON.stringify(process.env.MERU_API_URL ?? ""),
            /*
             * Unconditional for the same reason. `build:js` pins
             * `NODE_ENV=production` so that Bun leaves `.env.development.local`
             * alone here, the file a development run takes the id from, which
             * keeps inlining one into a build an explicit
             * `MERU_DEV_DEVICE_ID=...` in front of it.
             */
            "process.env.MERU_DEV_DEVICE_ID": JSON.stringify(process.env.MERU_DEV_DEVICE_ID ?? ""),
            ...(process.env.APPLE_TEAM_ID
              ? {
                  "process.env.APPLE_TEAM_ID": JSON.stringify(process.env.APPLE_TEAM_ID),
                }
              : {}),
          }
        : undefined,
    },
  });

  const buildPreloadFile = (preloadName: string) =>
    rolldown({
      ...rolldownOptions,
      input: `./packages/${preloadName}/index.ts`,
      platform: "browser",
      transform: {
        ...rolldownOptions.transform,
        target: browserTarget,
      },
      plugins: [
        {
          name: "css-loader",
          load: async (id) => {
            if (!id.endsWith(".css")) {
              return null;
            }

            const content = await postcss()
              .use(postcssTailwind())
              .process(await Bun.file(id).text(), { from: id })
              .then((result) => result.css);

            return {
              code: `export default ${JSON.stringify(content)};`,
              moduleType: "js",
            };
          },
        },
      ],
    }).then((bundle) =>
      bundle.write({
        file: path.join(process.cwd(), "build-js", `${preloadName}.js`),
        codeSplitting: false,
        format: "cjs",
        minify: appBundleMinify,
      }),
    );

  /*
   * Runs inside extensions rather than in Meru, so it is bundled like a preload
   * and copied into every extension the loader derives.
   *
   * Minified in a development build too, where the app's own bundles are not:
   * one of these loads in every extension context — the service worker, each
   * popup and options page, and every inline-menu iframe a page gets — so the
   * bytes a developer runs are the bytes that ship. Names are mangled here, as
   * nothing logs a stack out of an extension context. The derive writes the
   * token in front of whatever it is handed, and names the file itself, so
   * nothing downstream reads the output's contents.
   */
  const buildExtensionScript = (inputPath: string, outputFileName: string) =>
    rolldown({
      ...rolldownOptions,
      input: inputPath,
      platform: "browser",
      transform: {
        ...rolldownOptions.transform,
        target: browserTarget,
      },
    }).then((bundle) =>
      bundle.write({
        file: path.join(process.cwd(), "build-js", outputFileName),
        codeSplitting: false,
        format: "iife",
        minify: true,
      }),
    );

  /*
   * The checked-in fixture extension, assembled as a loadable unpacked
   * extension: its scripts bundled like the other extension scripts — rolldown,
   * never `bun build`, whose node polyfills once inflated the shim about 70x —
   * and its static files copied next to them. It ships with the app so the
   * end-to-end flag can only ever enable this directory, not name one.
   */
  const buildFixtureExtension = () => {
    const fixtureDir = path.join(process.cwd(), "packages", "electron-extensions", "fixture");

    const fixtureOutDir = path.join(process.cwd(), "build-js", "fixture-extension");

    const buildFixtureScript = (scriptFileName: string) =>
      rolldown({
        ...rolldownOptions,
        input: path.join(fixtureDir, `${scriptFileName}.ts`),
        platform: "browser",
        transform: {
          ...rolldownOptions.transform,
          target: browserTarget,
        },
      }).then((bundle) =>
        bundle.write({
          file: path.join(fixtureOutDir, `${scriptFileName}.js`),
          codeSplitting: false,
          format: "iife",
          minify: appBundleMinify,
        }),
      );

    const copyFixtureFile = (fileName: string) =>
      Bun.write(path.join(fixtureOutDir, fileName), Bun.file(path.join(fixtureDir, fileName)));

    return Promise.all([
      buildFixtureScript("background"),
      buildFixtureScript("probe"),
      copyFixtureFile("manifest.json"),
      copyFixtureFile("popup.html"),
      copyFixtureFile("fixture-frame.html"),
      // Chromium substitutes the manifest's `__MSG_*__` names out of these as
      // it loads the copy, which is what the proxy's `getManifest` overlay is
      // held against
      copyFixtureFile(path.join("_locales", "en", "messages.json")),
    ]);
  };

  return Promise.all([
    rolldown({
      ...rolldownOptions,
      input: "./packages/app/index.ts",
      platform: "node",
      transform: {
        ...rolldownOptions.transform,
        target: "node24",
        define: {
          ...rolldownOptions.transform?.define,
          // zustand/middleware is a single barrel, so importing
          // subscribeWithSelector also pulls in devtools and its
          // `import.meta.env` reads, which rolldown warns about under the `cjs`
          // format. devtools is tree-shaken out, so the value never matters.
          "import.meta": "{}",
        },
      },
      moduleTypes: {
        ".css": "text",
      },
    }).then((bundle) =>
      bundle.write({
        file: path.join(process.cwd(), "build-js", "app.js"),
        format: "cjs",
        minify: appBundleMinify,
      }),
    ),
    buildPreloadFile("preload-gmail"),
    buildPreloadFile("preload-workspace-app"),
    buildPreloadFile("preload-renderer"),
    buildExtensionScript(
      "./packages/electron-extensions/facade/index.ts",
      "extensions-chrome-facade.js",
    ),
    buildExtensionScript(
      "./packages/electron-extensions/runtime-proxy/shim-entry.ts",
      "extensions-runtime-proxy-shim.js",
    ),
    buildExtensionScript(
      "./packages/electron-extensions/runtime-proxy/relay-entry.ts",
      "extensions-runtime-proxy-relay.js",
    ),
    buildFixtureExtension(),
  ]);
}

/*
 * Pinned to one stack: "localhost" resolves to both 127.0.0.1 and ::1, and
 * Vite's free-port probe claims only one of them, so simultaneous dev servers
 * can each believe they own the same port.
 */
const RENDERER_HOST = "127.0.0.1";

/**
 * Where the renderer is actually being served, which is what Electron is handed.
 *
 * Read off the server rather than taken from the port it was asked for: Vite
 * moves to the next free port when that one is taken, which is what lets a second
 * worktree run `bun run dev` while the first is up. Handing Electron the number
 * this run asked for would point it at the other worktree's renderer.
 */
function resolveRendererUrl(server: vite.ViteDevServer) {
  const resolvedUrl = server.resolvedUrls?.local[0];

  if (resolvedUrl) {
    return resolvedUrl;
  }

  const address = server.httpServer?.address();

  if (!address || typeof address === "string") {
    throw new Error("The renderer dev server is listening on no address Electron could be given");
  }

  return `http://${RENDERER_HOST}:${address.port}/`;
}

async function buildRenderer(rendererName: string, port: number) {
  const rendererRoot = path.join(process.cwd(), "packages", rendererName);

  const pageFileNames = Array.from(new Bun.Glob("*.html").scanSync(rendererRoot));

  const viteConfig: vite.InlineConfig = {
    configFile: false,
    root: rendererRoot,
    base: "./",
    plugins: [viteReact(), viteTailwindcss()],
    resolve: {
      tsconfigPaths: true,
    },
    server: {
      host: RENDERER_HOST,
      port,
    },
    build: {
      outDir: path.join(process.cwd(), "build-js", rendererName),
      target: browserTarget,
      rollupOptions: {
        input: pageFileNames.map((pageFileName) => path.join(rendererRoot, pageFileName)),
      },
    },
    clearScreen: false,
  };

  if (args.values.dev) {
    const viteServer = await vite.createServer(viteConfig);

    await viteServer.listen();

    viteServer.printUrls();

    return resolveRendererUrl(viteServer);
  }

  await vite.build(viteConfig);
}

const [, rendererUrl] = await Promise.all([
  buildAppFiles(),
  buildRenderer("renderer", rendererPort),
]);

if (args.values.dev) {
  let electron: Subprocess;
  let isRestartingElectron = false;

  // `productName`, because that is the name Electron puts its default user data
  // directory under, in preference to the package's own `name`.
  const { productName } = (await Bun.file("package.json").json()) as { productName: string };

  const resolveUserDataDir = () => {
    if (profile) {
      return path.resolve(PROFILES_DIR, profile);
    }

    return namedUserDataDir
      ? path.resolve(namedUserDataDir)
      : defaultUserDataDir(
          { platform: process.platform, env: process.env, homeDir: homedir() },
          productName,
        );
  };

  const userDataDir = resolveUserDataDir();

  console.log(`Profile: ${profile ?? "none"} (${userDataDir})`);

  /*
   * Chromium picks the port itself, and writes it into the user data directory
   * once it has. Nothing else reports it, so a run that asked for one reads it
   * back and prints it.
   */
  const isDebugPortPickedByChromium = args.values["debug-port"] === "0";

  const devToolsActivePortPath = path.join(userDataDir, "DevToolsActivePort");

  const DEBUG_PORT_TIMEOUT = 10_000;

  const DEBUG_PORT_POLL_INTERVAL = 100;

  /*
   * Polled, because the file appears a moment after the process does. Reading an
   * empty or half-written one is therefore ordinary rather than a failure, which
   * is why `parseDevToolsActivePort` answers instead of throwing.
   */
  const printDebugPort = async () => {
    const deadline = Date.now() + DEBUG_PORT_TIMEOUT;

    while (Date.now() < deadline) {
      const contents = await Bun.file(devToolsActivePortPath)
        .text()
        .catch(() => "");

      const port = parseDevToolsActivePort(contents);

      if (port) {
        console.log(`Debug port: ${port} (http://${RENDERER_HOST}:${port}/json/version)`);

        return;
      }

      await Bun.sleep(DEBUG_PORT_POLL_INTERVAL);
    }

    console.log(`No debug port was written to ${devToolsActivePortPath}`);
  };

  const startElectron = async () => {
    // A killed browser leaves its own file behind, and a stale port reads
    // exactly like the one this launch is waiting for.
    if (isDebugPortPickedByChromium) {
      await rm(devToolsActivePortPath, { force: true });
    }

    electron = spawn(
      [
        "electron",
        ".",
        ...(args.values.devtools ? ["--devtools"] : []),
        ...(args.values["debug-port"]
          ? [`--remote-debugging-port=${args.values["debug-port"]}`]
          : []),
        ...electronArgs,
      ],
      {
        env: { ...process.env, MERU_RENDERER_URL: rendererUrl },
        onExit: async () => {
          if (isRestartingElectron) {
            isRestartingElectron = false;
          } else {
            await electron.exited;

            process.exit(0);
          }
        },
      },
    );

    if (isDebugPortPickedByChromium) {
      await printDebugPort();
    }
  };

  const stopElectron = () => {
    electron.kill();

    return electron.exited;
  };

  const restartElectron = async () => {
    isRestartingElectron = true;

    await stopElectron();

    await startElectron();
  };

  await startElectron();

  const watcher = watch("./packages", { recursive: true });

  for await (const event of watcher) {
    const rendererPathnames = ["renderer/", "shared/renderer/", "ui/"];

    if (rendererPathnames.some((pathname) => event.filename?.startsWith(pathname))) {
      continue;
    }

    await buildAppFiles();

    await restartElectron();
  }
}
