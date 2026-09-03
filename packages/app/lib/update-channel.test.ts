import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Config } from "@meru/shared/types";
import { NodeHttpExecutor } from "builder-util/out/nodeHttpExecutor";
import { AppImageUpdater } from "electron-updater/out/AppImageUpdater";
import { getChannelFilename } from "electron-updater/out/util";
import { resolveUpdateChannel } from "./update-channel";

const stableVersion = { prerelease: [] };
const prereleaseVersion = { prerelease: ["beta", 2] };

describe("resolveUpdateChannel", () => {
  test("names the stable channel rather than leaving it unset", () => {
    // electron-updater's setter throws on anything but a non-empty string once
    // a channel has been assigned, so switching Beta back to Stable in one
    // session depends on this never being null.
    expect(resolveUpdateChannel("stable", stableVersion).channel).toBe("latest");
  });

  test("passes the prerelease channel through", () => {
    expect(resolveUpdateChannel("beta", stableVersion).channel).toBe("beta");
  });

  test("allows prereleases only on the prerelease channel", () => {
    expect(resolveUpdateChannel("beta", prereleaseVersion).allowPrerelease).toBe(true);
    expect(resolveUpdateChannel("stable", prereleaseVersion).allowPrerelease).toBe(false);
  });

  test("downgrades a prerelease build the moment it leaves the channel", () => {
    expect(resolveUpdateChannel("stable", prereleaseVersion).allowDowngrade).toBe(true);
  });

  test("leaves a stable build on the stable channel with nothing to downgrade to", () => {
    expect(resolveUpdateChannel("stable", stableVersion).allowDowngrade).toBe(false);
  });

  test("never downgrades while the prerelease channel is selected", () => {
    expect(resolveUpdateChannel("beta", prereleaseVersion).allowDowngrade).toBe(false);
  });

  test("resolves every row of the channel table in the release-channels doc", () => {
    expect(resolveUpdateChannel("stable", stableVersion)).toEqual({
      channel: "latest",
      allowPrerelease: false,
      allowDowngrade: false,
    });
    expect(resolveUpdateChannel("beta", prereleaseVersion)).toEqual({
      channel: "beta",
      allowPrerelease: true,
      allowDowngrade: false,
    });
    expect(resolveUpdateChannel("stable", prereleaseVersion)).toEqual({
      channel: "latest",
      allowPrerelease: false,
      allowDowngrade: true,
    });
  });
});

/**
 * A release as GitHub serves it: the tag the provider builds every download
 * path from, the prerelease flag `/releases/latest` filters on, and the channel
 * metadata files the release carries. A release only ever carries its own
 * channel's file — `latest*.yml` on a stable, `beta*.yml` on a prerelease —
 * which is what makes convergence onto a promoted stable a 404 and a retry.
 */
type FakeRelease = {
  tag: string;
  prerelease: boolean;
  channels: string[];
  publishedAt: string;
};

/**
 * The platform suffix `Provider.getChannelFilePrefix` puts between the channel
 * name and `.yml`, so the expectations below name the same file the provider
 * asks for on whichever machine runs the suite.
 */
function channelFile(channel: string) {
  if (process.platform === "linux") {
    const arch = process.env.TEST_UPDATER_ARCH || process.arch;

    return getChannelFilename(`${channel}-linux${arch === "x64" ? "" : `-${arch}`}`);
  }

  return getChannelFilename(process.platform === "darwin" ? `${channel}-mac` : channel);
}

const feedPath = "/zoidsh/meru/releases.atom";

// The custom host takes `getLatestTagName` down the GitHub Enterprise path,
// which `computeGithubBasePath` prefixes with `/api/v3`.
const latestReleasePath = "/api/v3/repos/zoidsh/meru/releases/latest";

function downloadPath(tag: string, channel: string) {
  return `/zoidsh/meru/releases/download/${tag}/${channelFile(channel)}`;
}

// Nothing here downloads, so the checksum only has to be present: `resolveFiles`
// rejects an entry that carries neither a sha512 nor a sha2.
function channelYml(version: string) {
  return [
    `version: ${version}`,
    "files:",
    `  - url: meru-${version}.AppImage`,
    "    sha512: c2hhNTEy",
    "    size: 1",
    `path: meru-${version}.AppImage`,
    "sha512: c2hhNTEy",
    "releaseDate: '2026-09-01T00:00:00.000Z'",
    "",
  ].join("\n");
}

function atomFeed(host: string, releases: FakeRelease[]) {
  const entries = releases.map(
    (release) => `  <entry>
    <id>tag:github.com,2008:Repository/1/${release.tag}</id>
    <updated>${release.publishedAt}</updated>
    <link rel="alternate" type="text/html" href="http://${host}/zoidsh/meru/releases/tag/${release.tag}"/>
    <title>${release.tag}</title>
    <content type="html">Release notes for ${release.tag}</content>
  </entry>`,
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>tag:github.com,2008:https://github.com/zoidsh/meru/releases</id>
  <title>Release notes from meru</title>
${entries.join("\n")}
</feed>`;
}

function respond(
  response: ServerResponse,
  statusCode: number,
  headers: Record<string, string>,
  body: string,
) {
  response.writeHead(statusCode, headers);
  response.end(body);
}

const closers: (() => Promise<void>)[] = [];

/**
 * Enough of GitHub for the provider to walk: the releases feed, the API's
 * latest-release lookup, and the release assets. Every request path is recorded
 * in order, because the sequence is what the scenarios are really about.
 */
async function startFakeGitHub(releases: FakeRelease[]) {
  const requests: string[] = [];

  const server = createServer((request, response) => {
    const path = request.url ?? "";

    requests.push(path);

    if (path === feedPath) {
      respond(
        response,
        200,
        { "content-type": "application/atom+xml" },
        atomFeed(request.headers.host ?? "", releases),
      );

      return;
    }

    if (path === latestReleasePath) {
      // GitHub's latest is the newest release that is neither a prerelease nor
      // a draft, which in feed order is the first one.
      const latest = releases.find((release) => !release.prerelease);

      if (!latest) {
        respond(response, 404, { "content-type": "application/json" }, `{"message":"Not Found"}`);

        return;
      }

      respond(
        response,
        200,
        { "content-type": "application/json" },
        JSON.stringify({ tag_name: latest.tag }),
      );

      return;
    }

    const download = /^\/zoidsh\/meru\/releases\/download\/([^/]+)\/([^/]+)$/.exec(path);
    const release = download && releases.find(({ tag }) => tag === download[1]);
    const carriesFile = release?.channels.some((channel) => channelFile(channel) === download?.[2]);

    if (download && release && carriesFile) {
      respond(
        response,
        200,
        { "content-type": "text/yaml" },
        channelYml(release.tag.replace(/^v/, "")),
      );

      return;
    }

    respond(response, 404, { "content-type": "text/plain" }, "Not Found");
  });

  await new Promise<void>((resolve) => {
    // Bound and addressed as 127.0.0.1 rather than localhost, so a host that
    // resolves localhost to ::1 first can't send the check somewhere else.
    server.listen(0, "127.0.0.1", resolve);
  });

  closers.push(() => new Promise<void>((resolve) => server.close(() => resolve())));

  return { host: `127.0.0.1:${(server.address() as AddressInfo).port}`, requests };
}

async function createUpdater(currentVersion: string, host: string) {
  const userDataPath = await mkdtemp(join(tmpdir(), "meru-updater-"));

  closers.push(() => rm(userDataPath, { force: true, recursive: true }));

  const updater = new AppImageUpdater(null, {
    version: currentVersion,
    name: "Meru",
    isPackaged: true,
    // Never read: `setFeedURL` below installs the provider, so the updater
    // never falls back to the on-disk `app-update.yml`.
    appUpdateConfigPath: join(userDataPath, "app-update.yml"),
    userDataPath,
    baseCachePath: userDataPath,
    whenReady: () => Promise.resolve(),
    relaunch: () => {},
    quit: () => {},
    onQuit: () => {},
  });

  updater.logger = null;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;

  // A failed check emits `error` as well as rejecting, and the constructor's
  // own handler goes through the logger we just silenced.
  updater.on("error", () => {});

  // Passing an app adapter leaves `httpExecutor` null instead of building the
  // Electron one, and `setFeedURL` snapshots it, so it has to be assigned
  // first. The shipped `.d.ts` declares the field nowhere, hence the cast.
  (updater as unknown as { httpExecutor: NodeHttpExecutor }).httpExecutor = new NodeHttpExecutor();

  updater.setFeedURL({ provider: "github", protocol: "http", host, owner: "zoidsh", repo: "meru" });

  return updater;
}

/** `AppUpdater.applyChannel` in updater.ts, in the order it assigns. */
function applyChannel(updater: AppImageUpdater, channel: Config["updates.channel"]) {
  const resolved = resolveUpdateChannel(channel, updater.currentVersion);

  updater.channel = resolved.channel;
  updater.allowPrerelease = resolved.allowPrerelease;
  updater.allowDowngrade = resolved.allowDowngrade;
}

const v3_59_0 = {
  tag: "v3.59.0",
  prerelease: false,
  channels: ["latest"],
  publishedAt: "2026-08-01T00:00:00Z",
};

const v3_59_1 = {
  tag: "v3.59.1",
  prerelease: false,
  channels: ["latest"],
  publishedAt: "2026-09-01T00:00:00Z",
};

const v3_60_0 = {
  tag: "v3.60.0",
  prerelease: false,
  channels: ["latest"],
  publishedAt: "2026-09-02T00:00:00Z",
};

const v3_60_0_beta_1 = {
  tag: "v3.60.0-beta.1",
  prerelease: true,
  channels: ["beta"],
  publishedAt: "2026-08-25T00:00:00Z",
};

const v3_60_0_beta_2 = {
  tag: "v3.60.0-beta.2",
  prerelease: true,
  channels: ["beta"],
  publishedAt: "2026-08-28T00:00:00Z",
};

const v3_60_0_nightly_1 = {
  tag: "v3.60.0-nightly.1",
  prerelease: true,
  channels: ["nightly"],
  publishedAt: "2026-08-30T00:00:00Z",
};

describe("the GitHub provider against the channels Meru resolves", () => {
  const appImage = process.env.APPIMAGE;

  beforeAll(() => {
    // `AppImageUpdater.isUpdaterActive` refuses to check without it, and
    // `checkForUpdates` resolves null rather than reaching the provider.
    process.env.APPIMAGE = join(tmpdir(), "Meru.AppImage");
  });

  afterAll(() => {
    if (appImage === undefined) {
      delete process.env.APPIMAGE;
    } else {
      process.env.APPIMAGE = appImage;
    }
  });

  afterEach(async () => {
    await Promise.all(closers.splice(0).map((close) => close()));
  });

  test("offers a Beta user the newest prerelease from the release it resolves", async () => {
    const github = await startFakeGitHub([v3_60_0_beta_2, v3_59_0]);
    const updater = await createUpdater("3.60.0-beta.1", github.host);

    applyChannel(updater, "beta");

    const check = await updater.checkForUpdates();

    expect(github.requests).toEqual([feedPath, downloadPath("v3.60.0-beta.2", "beta")]);
    expect(check?.isUpdateAvailable).toBe(true);
    expect(check?.updateInfo.version).toBe("3.60.0-beta.2");
  });

  test("falls back to latest-*.yml when the beta file 404s on a promoted stable", async () => {
    const github = await startFakeGitHub([v3_60_0, v3_60_0_beta_1, v3_59_0]);
    const updater = await createUpdater("3.60.0-beta.1", github.host);

    applyChannel(updater, "beta");

    const check = await updater.checkForUpdates();

    // The stable release is the first entry the walk accepts, and it carries no
    // `beta*.yml`, so convergence is that 404 and the retry after it.
    expect(github.requests).toEqual([
      feedPath,
      downloadPath("v3.60.0", "beta"),
      downloadPath("v3.60.0", "latest"),
    ]);
    expect(check?.isUpdateAvailable).toBe(true);
    expect(check?.updateInfo.version).toBe("3.60.0");
  });

  test("keeps a stable user off the prerelease by asking the API for the latest release", async () => {
    const github = await startFakeGitHub([v3_60_0_beta_1, v3_59_0]);
    const updater = await createUpdater("3.59.0", github.host);

    applyChannel(updater, "stable");

    const check = await updater.checkForUpdates();

    // Nothing under the prerelease tag is ever requested: `/releases/latest`
    // skips it, and the stable release has the file the first fetch asks for.
    expect(github.requests).toEqual([
      feedPath,
      latestReleasePath,
      downloadPath("v3.59.0", "latest"),
    ]);
    expect(check?.isUpdateAvailable).toBe(false);
    expect(check?.updateInfo.version).toBe("3.59.0");
  });

  test("downgrades a Beta build onto the newest stable the moment the channel is left", async () => {
    const github = await startFakeGitHub([v3_60_0_beta_1, v3_59_0]);
    const updater = await createUpdater("3.60.0-beta.1", github.host);

    applyChannel(updater, "stable");

    expect(updater.allowDowngrade).toBe(true);

    const check = await updater.checkForUpdates();

    expect(github.requests).toEqual([
      feedPath,
      latestReleasePath,
      downloadPath("v3.59.0", "latest"),
    ]);
    expect(check?.isUpdateAvailable).toBe(true);
    expect(check?.updateInfo.version).toBe("3.59.0");
  });

  test("strands the same build on the prerelease when allowDowngrade is lost", async () => {
    const github = await startFakeGitHub([v3_60_0_beta_1, v3_59_0]);
    const updater = await createUpdater("3.60.0-beta.1", github.host);

    applyChannel(updater, "stable");

    // The negative control for the assignment order in `applyChannel`: the
    // channel setter force-enables `allowDowngrade`, and the offer above
    // survives only because the resolved value is written after it.
    updater.allowDowngrade = false;

    const check = await updater.checkForUpdates();

    expect(check?.isUpdateAvailable).toBe(false);
    expect(check?.updateInfo.version).toBe("3.59.0");
  });

  test("walks past a promoted stable on any channel that isn't alpha or beta", async () => {
    const github = await startFakeGitHub([v3_60_0, v3_60_0_nightly_1]);
    const updater = await createUpdater("3.60.0-nightly.1", github.host);

    // Set directly rather than through `resolveUpdateChannel`, which can only
    // produce `latest` or `beta`. This is why the config value is gated.
    updater.channel = "nightly";
    updater.allowPrerelease = true;
    updater.allowDowngrade = false;

    const check = await updater.checkForUpdates();

    // `getLatestVersion` only accepts a stable entry when the current channel is
    // alpha or beta, so the walk skips v3.60.0 and settles on the older nightly.
    expect(github.requests).toEqual([feedPath, downloadPath("v3.60.0-nightly.1", "nightly")]);
    expect(check?.isUpdateAvailable).toBe(false);
    expect(check?.updateInfo.version).toBe("3.60.0-nightly.1");
  });

  test("takes the same promoted stable on the beta channel", async () => {
    const github = await startFakeGitHub([v3_60_0, v3_60_0_nightly_1]);
    const updater = await createUpdater("3.60.0-beta.1", github.host);

    applyChannel(updater, "beta");

    const check = await updater.checkForUpdates();

    expect(github.requests).toEqual([
      feedPath,
      downloadPath("v3.60.0", "beta"),
      downloadPath("v3.60.0", "latest"),
    ]);
    expect(check?.isUpdateAvailable).toBe(true);
    expect(check?.updateInfo.version).toBe("3.60.0");
  });

  test("trusts feed order, so our assumption that GitHub emits newest-published first is pinned here rather than proven", async () => {
    // Same releases as the promoted-stable scenario, with v3.59.0 listed ahead
    // of the newer v3.60.0 even though its `<updated>` is older. Nothing in the
    // provider reads those dates; only a live feed can settle the ordering.
    const github = await startFakeGitHub([v3_59_0, v3_60_0, v3_60_0_beta_1]);
    const updater = await createUpdater("3.60.0-beta.1", github.host);

    applyChannel(updater, "beta");

    const check = await updater.checkForUpdates();

    expect(github.requests).toEqual([
      feedPath,
      downloadPath("v3.59.0", "beta"),
      downloadPath("v3.59.0", "latest"),
    ]);
    expect(check?.isUpdateAvailable).toBe(false);
    expect(check?.updateInfo.version).toBe("3.59.0");
  });

  test("strands a Beta user on a stable hotfix cut after their prerelease", async () => {
    const github = await startFakeGitHub([v3_59_1, v3_60_0_beta_1, v3_59_0]);
    const updater = await createUpdater("3.60.0-beta.1", github.host);

    applyChannel(updater, "beta");

    const check = await updater.checkForUpdates();

    // The walk breaks on the hotfix, falls back to its `latest*.yml`, and then
    // `allowDowngrade` is false on Beta, so the hotfix is declined and the beta
    // ahead of it is never offered either.
    expect(github.requests).toEqual([
      feedPath,
      downloadPath("v3.59.1", "beta"),
      downloadPath("v3.59.1", "latest"),
    ]);
    expect(check?.isUpdateAvailable).toBe(false);
    expect(check?.updateInfo.version).toBe("3.59.1");
  });
});
