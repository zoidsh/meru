/** The release channels, the default first. */
export const UPDATE_CHANNELS = ["stable", "beta"] as const;

export type UpdateChannel = (typeof UPDATE_CHANNELS)[number];

/**
 * The name electron-updater resolves a stable feed under (`latest-mac.yml`,
 * `latest.yml`, `latest-linux.yml`). Named rather than left unset: once a
 * channel is assigned the library refuses `null`, and unset it falls back to
 * the channel baked into a beta build's `app-update.yml`, which would ask a
 * stable release for beta files.
 */
const STABLE_FEED = "latest";

/** What the updater is set to for a channel, in the order they are assigned. */
export interface ChannelOptions {
  channel: string;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
}

const isPrerelease = (version: string) => /^v?\d+\.\d+\.\d+-/u.test(version);

/**
 * The library's options for a channel and the running version. Downgrade is
 * what moves a beta build onto the newest stable the moment its channel is
 * left, rather than leaving it there until a stable overtakes it.
 */
export const channelOptions = (
  channel: UpdateChannel,
  runningVersion: string
): ChannelOptions => {
  const stable = channel === "stable";

  return {
    channel: stable ? STABLE_FEED : channel,
    allowPrerelease: !stable,
    allowDowngrade: stable && isPrerelease(runningVersion),
  };
};

export const UPDATE_STATUSES = [
  "unsupported",
  "idle",
  "checking",
  "upToDate",
  "downloading",
  "ready",
  "failed",
  "unverified",
] as const;

export type UpdateStatusName = (typeof UPDATE_STATUSES)[number];

/**
 * Where updating stands, `version` the one downloading, ready or refused and
 * `null` otherwise, and when a check last finished.
 */
export interface UpdateStatus {
  status: UpdateStatusName;
  version: string | null;
  lastChecked: number | null;
}

export type UpdateEvent =
  | { kind: "checking" }
  | { kind: "available"; version: string }
  | { kind: "notAvailable" }
  | { kind: "downloaded"; version: string }
  | { kind: "error"; signature: boolean };

export const INITIAL_UPDATE_STATUS: UpdateStatus = {
  status: "idle",
  version: null,
  lastChecked: null,
};

/**
 * The status after an event, `available` the version last reported so a
 * signature failure can name it. A download that is ready stays ready
 * through any later check that offers nothing else, since the library still
 * installs it at quit.
 */
export const nextUpdateStatus = (
  current: UpdateStatus,
  event: UpdateEvent,
  { now, available }: { now: number; available: string | null }
): UpdateStatus => {
  const ready = current.status === "ready";

  switch (event.kind) {
    case "checking": {
      return ready
        ? current
        : { ...current, status: "checking", version: null };
    }
    case "available": {
      return ready && current.version === event.version
        ? { ...current, lastChecked: now }
        : { status: "downloading", version: event.version, lastChecked: now };
    }
    case "notAvailable": {
      return ready
        ? { ...current, lastChecked: now }
        : { status: "upToDate", version: null, lastChecked: now };
    }
    case "downloaded": {
      return { ...current, status: "ready", version: event.version };
    }
    default: {
      const version = available ?? current.version;

      if (event.signature && version !== null) {
        return { ...current, status: "unverified", version };
      }

      return ready
        ? current
        : { status: "failed", version: null, lastChecked: now };
    }
  }
};

/** Three hours, as v3 checks. */
export const UPDATE_CHECK_INTERVAL = 3 * 60 * 60 * 1000;

/** Meru's releases, newest first, each with its notes. */
export const RELEASES_URL = "https://github.com/zoidsh/meru/releases";

/** Where a version's release notes and downloads are. */
export const releasePageUrl = (version: string) =>
  `${RELEASES_URL}/tag/v${version}`;

/** What the main window's update card says: a version ready, or one refused. */
export interface UpdateCard {
  card: "ready" | "unverified";
  version: string;
}

/** The card's buttons and Escape: Restart now, What's new, Download, and Later or Close. */
export const UPDATE_CARD_ACTIONS = [
  "restart",
  "whats-new",
  "download",
  "dismiss",
] as const;

export type UpdateCardAction = (typeof UPDATE_CARD_ACTIONS)[number];

/** What each card offers. */
export const UPDATE_CARD_OFFERS: Record<
  UpdateCard["card"],
  readonly UpdateCardAction[]
> = {
  ready: ["whats-new", "dismiss", "restart"],
  unverified: ["dismiss", "download"],
};

/** How a dismissed card is remembered for the rest of the run. */
export const updateCardKey = ({ card, version }: UpdateCard) =>
  `${card}:${version}`;

/**
 * The card the status calls for, unless it was dismissed in this run: Later
 * on a ready version, Close on a refused one. A newer version is a card of
 * its own, so it shows again.
 */
export const updateCard = (
  { status, version }: UpdateStatus,
  dismissed: ReadonlySet<string>
): UpdateCard | undefined => {
  if ((status !== "ready" && status !== "unverified") || version === null) {
    return undefined;
  }

  const card: UpdateCard = { card: status, version };

  return dismissed.has(updateCardKey(card)) ? undefined : card;
};
