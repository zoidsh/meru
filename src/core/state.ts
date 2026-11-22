import { isEqual } from "es-toolkit";
import { z } from "zod/mini";

import { APPS, isAppId } from "./apps.ts";
import { paneTabs, readSplit } from "./pane-tree.ts";
import type { Split } from "./pane-tree.ts";
import { withColorsStored } from "./profile-color.ts";
import type { ProfileColorName } from "./profile-color.ts";
import { decodeVersioned } from "./store-file.ts";
import type { Decoded } from "./store-file.ts";
import type { Rectangle } from "./window-bounds.ts";

/**
 * Never changes. An older integer here reads as unreadable, so a bump would
 * set every person's file aside, and with the profiles their sign-ins. The
 * shape only grows, a new field optional and read leniently, so every build
 * reads every file written before it.
 */
export const STATE_VERSION = 1;

/** What v3 names its first account; kept in English and translated when shown. */
export const DEFAULT_PROFILE_NAME = "Default";

/** v3's id for the Gmail tab, which a new profile has, pinned. */
export const GMAIL_TAB_ID = "gmail";

const GMAIL_HOME = APPS.find((app) => app.id === "gmail")?.home ?? "";

// Loose at every level: a key a later build added on the same version, as a
// Beta may, survives this build rewriting the file.
const tabSchema = z.looseObject({
  id: z.string().check(z.minLength(1)),
  /** A string rather than the known ids, so a later build's app is kept. */
  app: z.string(),
  url: z.string(),
  title: z.string(),
});

// Profiles and their tabs are decoded one by one, so no one entry can make the
// file, and with it every profile's sign-in, unreadable.
const profileSchema = z.looseObject({
  id: z.string().check(z.minLength(1)),
  name: z.string(),
  tabs: z.optional(z.unknown()),
  selectedTabId: z.optional(z.unknown()),
});

const stateSchema = z.looseObject({
  version: z.literal(STATE_VERSION),
  profiles: z.array(z.unknown()),
  selectedProfileId: z.optional(z.unknown()),
  profilesToClear: z.optional(z.unknown()),
});

export type Tab = z.infer<typeof tabSchema>;

// Symbols, which a key read from JSON can never be and JSON never writes.
const UNREAD = Symbol("unread tab");
const TABS_AS_FOUND = Symbol("tabs as found");
const SPLIT_AS_FOUND = Symbol("split as found");
const SPLITS_AS_FOUND = Symbol("splits as found");
const UNREAD_PROFILES = Symbol("unread profiles");
const CLEAR_AS_FOUND = Symbol("profiles to clear as found");
const DO_NOT_DISTURB_AS_FOUND = Symbol("do not disturb as found");

/** The furthest from the epoch, either way, a `Date` holds, in milliseconds. */
const LONGEST_DATE = 8.64e15;

const doNotDisturbSchema = z.looseObject({
  /**
   * Milliseconds since the epoch, or `null` for until turned off; one no
   * `Date` holds would make writing its time throw.
   */
  until: z.nullable(
    z.number().check(z.gte(-LONGEST_DATE), z.lte(LONGEST_DATE))
  ),
});

/**
 * Do Not Disturb while it is switched on, which a restart keeps. Keys a later
 * build adds are kept.
 */
export type DoNotDisturb = z.infer<typeof doNotDisturbSchema>;

/**
 * What of `profilesToClear` is not a profile id: entries written back after
 * the ids, or a value that is not a list, written back while the list is
 * empty.
 */
type ClearAsFound = { entries: unknown[] } | { whole: unknown };

/**
 * An entry in the profiles that does not parse, kept as it was found and
 * written back after as many readable profiles as it followed.
 */
interface UnreadProfile {
  after: number;
  raw: unknown;
}

/** An entry in a profile's tabs that does not parse, kept as it was found. */
export interface UnreadTab {
  [UNREAD]: unknown;
}

export type TabEntry = Tab | UnreadTab;

export const isTab = (entry: TabEntry): entry is Tab => !(UNREAD in entry);

type StoredProfile = z.infer<typeof profileSchema>;

/**
 * A profile once decoded: at most one Gmail tab, and the selected tab one
 * that is shown, or `""` when none is.
 */
export interface Profile {
  [key: string]: unknown;
  id: string;
  name: string;
  tabs: TabEntry[];
  selectedTabId: string;
  /** `true` once Gmail's page said the inbox is tabbed; read through `hasTabbedInbox`. */
  tabbedInbox?: unknown;
  /** The profile's saved searches; read through `savedSearches`. */
  savedSearches?: unknown;
  /** The profile's bookmarks; read through `bookmarks`. */
  bookmarks?: unknown;
  /** `true` while the profile is put to sleep; read through `isAsleep`. */
  asleep?: unknown;
  /** The name of one of the palette's colours; read through `profileColor`. */
  color?: unknown;
  /**
   * The profile's splits, each holding tabs no other does, repaired as
   * read; set through `withSplit`.
   */
  splits?: Split[];
  /**
   * A `tabs` that is not a list, written back in its place; the tabs the
   * profile has instead live only in memory.
   */
  [TABS_AS_FOUND]?: unknown;
  /**
   * A `split`, the previous builds' one split, written back as found: one
   * that is no split, or any beside a `splits`, which is what is read.
   */
  [SPLIT_AS_FOUND]?: unknown;
  /**
   * The `splits` entries that are no split, each written back at its place
   * in the list, or a `splits` that is not a list, written back while there
   * are none.
   */
  [SPLITS_AS_FOUND]?:
    | { entries: { index: number; value: unknown }[] }
    | { whole: unknown };
}

type StoredState = z.infer<typeof stateSchema>;

// Spelled out, since `Omit` drops every named key of a loose object's type.
export interface State {
  [key: string]: unknown;
  version: StoredState["version"];
  /** The profiles that parse; the rest are kept but never shown. */
  profiles: Profile[];
  selectedProfileId: string;
  /**
   * Removed profiles whose session data is still to be deleted, so a quit
   * between the removal and the clear is finished at the next launch.
   */
  profilesToClear?: string[];
  /** Absent while off; one that has ended still reads as off. */
  doNotDisturb?: DoNotDisturb;
  [UNREAD_PROFILES]?: readonly UnreadProfile[];
  [CLEAR_AS_FOUND]?: ClearAsFound;
  /** A `doNotDisturb` that does not decode, written back until it is switched. */
  [DO_NOT_DISTURB_AS_FOUND]?: unknown;
}

export const gmailTab = (): Tab => ({
  id: GMAIL_TAB_ID,
  app: "gmail",
  url: GMAIL_HOME,
  title: "",
  pinned: true,
  openAtLaunch: true,
});

/**
 * Whether the tab is pinned, which keeps it from closing. Anything but `true`
 * in the file, absent included, reads as not, and stays as found until the
 * tab is pinned or unpinned. A stored tab holds `pinned` only under its
 * loose schema's index, which a type naming the key alone would refuse.
 */
export const isPinned = (
  tab: { readonly pinned?: unknown } | Readonly<Record<string, unknown>>
) => tab.pinned === true;

/** Whether a pinned tab loads at launch, before it is first selected. */
export const opensAtLaunch = (tab: Tab) =>
  isPinned(tab) && tab.openAtLaunch === true;

/**
 * Whether the tab was moved to a window of its own. Anything but `true`
 * reads as not, and a pinned tab never is, since a pinned app cannot be
 * moved; either stays as found until the tab is moved.
 */
export const inOwnWindow = (tab: Tab) =>
  tab.ownWindow === true && !isPinned(tab);

/** The profile's Gmail tab while it is in its own window, which shows its mail there. */
export const gmailOwnWindow = (
  state: State,
  profileId: string
): { profileId: string; tabId: string } | undefined => {
  const profile = state.profiles.find(
    (candidate) => candidate.id === profileId
  );
  const gmail =
    profile && knownTabs(profile).find((tab) => tab.app === "gmail");

  return gmail && inOwnWindow(gmail)
    ? { profileId, tabId: gmail.id }
    : undefined;
};

/**
 * Where the tab's own window last was, kept after it moves back so it opens
 * there again; anything but four finite numbers reads as none.
 */
export const ownWindowBounds = (tab: Tab): Rectangle | undefined => {
  const bounds: unknown = tab.windowBounds;

  if (typeof bounds !== "object" || bounds === null) {
    return;
  }

  const { x, y, width, height } = bounds as Record<string, unknown>;

  return [x, y, width, height].every(
    (value) => typeof value === "number" && Number.isFinite(value)
  )
    ? ({ x, y, width, height } as Rectangle)
    : undefined;
};

/**
 * The tabs of apps this build knows; the rest, and entries that do not parse,
 * are kept but not shown.
 */
export const knownTabs = (profile: Pick<Profile, "tabs">): Tab[] =>
  profile.tabs.filter((entry) => isTab(entry) && isAppId(entry.app)) as Tab[];

/** A tab entry's id, also of one that does not parse, where it has one. */
const entryId = (entry: TabEntry): string[] => {
  const raw: unknown = isTab(entry) ? entry : entry[UNREAD];

  return typeof raw === "object" &&
    raw !== null &&
    "id" in raw &&
    typeof raw.id === "string"
    ? [raw.id]
    : [];
};

const readTabs = (stored: unknown): TabEntry[] =>
  (Array.isArray(stored) ? stored : []).map((entry: unknown) => {
    const parsed = tabSchema.safeParse(entry);

    return parsed.success ? parsed.data : { [UNREAD]: entry };
  });

/**
 * A Gmail tab written before tabs could be pinned was the one every profile
 * had, so it reads as a new profile's: pinned and opening at launch.
 */
const pinnedByDefault = (tab: Tab): Tab =>
  tab.app === "gmail" && !("pinned" in tab)
    ? { ...tab, pinned: true, openAtLaunch: tab.openAtLaunch ?? true }
    : tab;

/**
 * Puts a profile's tabs in the shape every reader relies on, rather than
 * refusing a file over them: in the order stored, one Gmail tab, ids unique,
 * and a selected tab that is shown, else the first shown, else none. A
 * profile written with no tabs, or with tabs that are not a list, has a new
 * profile's; an empty list is none.
 */
const normalizeProfile = (profile: StoredProfile): Profile => {
  const stored = Array.isArray(profile.tabs)
    ? readTabs(profile.tabs)
    : [gmailTab()];
  const gmails = stored.filter(isTab).filter((tab) => tab.app === "gmail");
  const gmail = gmails.find((tab) => tab.id === GMAIL_TAB_ID) ?? gmails[0];
  const seen = new Set<string>();
  const tabs = stored
    .filter(
      (entry) => !isTab(entry) || entry.app !== "gmail" || entry === gmail
    )
    .filter((entry) => {
      if (!isTab(entry)) {
        return true;
      }

      if (seen.has(entry.id)) {
        return false;
      }

      seen.add(entry.id);

      return true;
    })
    .map((entry) => (isTab(entry) ? pinnedByDefault(entry) : entry));
  // A tab in its own window is never the main window's selected one.
  const shown = knownTabs({ tabs }).filter((tab) => !inOwnWindow(tab));
  const { selectedTabId } = profile;
  const decoded: Profile = {
    ...profile,
    tabs,
    selectedTabId:
      typeof selectedTabId === "string" &&
      shown.some((tab) => tab.id === selectedTabId)
        ? selectedTabId
        : (shown[0]?.id ?? ""),
  };

  if (profile.tabs !== undefined && !Array.isArray(profile.tabs)) {
    decoded[TABS_AS_FOUND] = profile.tabs;
  }

  if ("splits" in profile || "split" in profile) {
    delete decoded.split;
    delete decoded.splits;
    decodeSplits(decoded, profile, new Set(tabs.flatMap(entryId)));
  }

  return decoded;
};

/**
 * Sets a stored profile's splits on `decoded`, read back: `splits`, or the
 * previous builds' one `split` as a list of one, which is not written
 * again. A `split` beside a `splits` is kept as found, unread, for the
 * build that wrote it. A tab of an app this build does not know keeps its
 * pane, for a build that does; only a tab gone from the list loses it, and
 * a tab an earlier split holds too.
 */
const decodeSplits = (
  decoded: Profile,
  profile: Record<string, unknown>,
  listed: ReadonlySet<string>
) => {
  const isNew = "splits" in profile;
  const stored = isNew ? profile.splits : [profile.split];

  if (isNew && "split" in profile) {
    decoded[SPLIT_AS_FOUND] = profile.split;
  }

  if (!Array.isArray(stored)) {
    decoded[SPLITS_AS_FOUND] = { whole: stored };

    return;
  }

  const claimed = new Set<string>();
  const splits: Split[] = [];
  const entries: { index: number; value: unknown }[] = [];

  for (const [index, value] of stored.entries()) {
    const read = readSplit(
      value,
      (tabId) => listed.has(tabId) && !claimed.has(tabId)
    );

    if (read.kind === "split") {
      splits.push(read.split);

      for (const tabId of paneTabs(read.split.root)) {
        claimed.add(tabId);
      }
    } else if (read.kind === "as-found") {
      entries.push({ index, value });
    }
  }

  if (splits.length > 0) {
    decoded.splits = splits;
  }

  if (entries.length > 0 && isNew) {
    decoded[SPLITS_AS_FOUND] = { entries };
  } else if (entries.length > 0) {
    decoded[SPLIT_AS_FOUND] = profile.split;
  }
};

/** `splits` with each entry kept as found back at its stored place. */
const withEntries = (
  splits: readonly Split[],
  entries: readonly { index: number; value: unknown }[]
) => {
  const written: unknown[] = [...splits];

  for (const { index, value } of entries) {
    written.splice(Math.min(index, written.length), 0, value);
  }

  return written;
};

const encodeSplits = (profile: Profile) => {
  const asFound = profile[SPLITS_AS_FOUND];
  const splits = profile.splits ?? [];

  if (asFound && "entries" in asFound) {
    return { splits: withEntries(splits, asFound.entries) };
  }

  return asFound && splits.length === 0 ? { splits: asFound.whole } : {};
};

const encodeProfile = (profile: Profile) => ({
  ...profile,
  ...encodeSplits(profile),
  ...(SPLIT_AS_FOUND in profile && { split: profile[SPLIT_AS_FOUND] }),
  tabs:
    TABS_AS_FOUND in profile
      ? profile[TABS_AS_FOUND]
      : profile.tabs.map((entry) => (isTab(entry) ? entry : entry[UNREAD])),
});

/**
 * The state as its file holds it, with every profile and tab entry that did
 * not parse as it was found, in its place.
 */
export const encodeState = (state: State): unknown => {
  const unread = state[UNREAD_PROFILES] ?? [];
  const { length } = state.profiles;
  const placedAfter = (count: number) =>
    unread
      .filter((entry) => Math.min(entry.after, length) === count)
      .map((entry) => entry.raw);

  const asFound = state[CLEAR_AS_FOUND];
  let profilesToClear: unknown = state.profilesToClear;

  if (asFound && "entries" in asFound) {
    profilesToClear = [...(state.profilesToClear ?? []), ...asFound.entries];
  } else if (asFound && (state.profilesToClear ?? []).length === 0) {
    profilesToClear = asFound.whole;
  }

  return {
    ...state,
    ...(profilesToClear === undefined ? {} : { profilesToClear }),
    ...(DO_NOT_DISTURB_AS_FOUND in state && {
      doNotDisturb: state[DO_NOT_DISTURB_AS_FOUND],
    }),
    profiles: [
      ...placedAfter(0),
      ...state.profiles.flatMap((profile, index) => [
        encodeProfile(profile),
        ...placedAfter(index + 1),
      ]),
    ],
  };
};

/** The ids of profiles that do not parse, where an id can be read. */
const unreadProfileIds = (state: State) =>
  (state[UNREAD_PROFILES] ?? []).flatMap(({ raw }) =>
    typeof raw === "object" &&
    raw !== null &&
    "id" in raw &&
    typeof raw.id === "string"
      ? [raw.id]
      : []
  );

/**
 * The profile with `next` in place of `previous`, one of its splits; with no
 * `previous`, `next` is added after the others, and with no `next`,
 * `previous` ends.
 */
export const withSplit = (
  profile: Profile,
  previous: Split | undefined,
  next: Split | undefined
): Profile => {
  const { splits: _splits, ...rest } = profile;
  const kept = profile.splits ?? [];
  const added = next ? [next] : [];
  const splits = previous
    ? kept.flatMap((split) => (split === previous ? added : [split]))
    : [...kept, ...added];

  return splits.length > 0 ? { ...rest, splits } : rest;
};

/** A profile with only its Gmail tab, pinned and opening at launch. */
export const newProfile = (id: string, name: string): Profile => ({
  id,
  name,
  tabs: [gmailTab()],
  selectedTabId: GMAIL_TAB_ID,
});

const isId = (entry: unknown): entry is string =>
  typeof entry === "string" && entry !== "";

/** Whether JSON writes `value` back as what reading it gave. */
const writesBackAsRead = (value: unknown) => {
  const written = JSON.stringify(value);

  return written !== undefined && isEqual(JSON.parse(written), value);
};

export const decodeState = (value: unknown): Decoded<State> => {
  const result = decodeVersioned(value, STATE_VERSION, stateSchema);

  if (result.kind !== "read") {
    return result;
  }

  const profiles: Profile[] = [];
  const unread: UnreadProfile[] = [];

  for (const entry of result.value.profiles) {
    const parsed = profileSchema.safeParse(entry);

    if (parsed.success) {
      profiles.push(normalizeProfile(parsed.data));
    } else {
      unread.push({ after: profiles.length, raw: entry });
    }
  }

  const { selectedProfileId, profilesToClear, doNotDisturb, ...rest } =
    result.value;
  const decodedDoNotDisturb =
    doNotDisturb === undefined
      ? undefined
      : doNotDisturbSchema.safeParse(doNotDisturb);
  const state: State = {
    ...rest,
    ...(profilesToClear === undefined
      ? {}
      : {
          profilesToClear: Array.isArray(profilesToClear)
            ? profilesToClear.filter(isId)
            : [],
        }),
    ...(decodedDoNotDisturb?.success && {
      doNotDisturb: decodedDoNotDisturb.data,
    }),
    profiles,
    selectedProfileId: profiles.some(
      (profile) => profile.id === selectedProfileId
    )
      ? String(selectedProfileId)
      : (profiles[0]?.id ?? ""),
  };

  if (unread.length > 0) {
    state[UNREAD_PROFILES] = unread;
  }

  // One JSON cannot write back as it was, such as an end that read as
  // Infinity and would be written as null, is dropped rather than turned on.
  if (
    decodedDoNotDisturb &&
    !decodedDoNotDisturb.success &&
    writesBackAsRead(doNotDisturb)
  ) {
    state[DO_NOT_DISTURB_AS_FOUND] = doNotDisturb;
  }

  if (profilesToClear !== undefined && !Array.isArray(profilesToClear)) {
    state[CLEAR_AS_FOUND] = { whole: profilesToClear };
  } else if (profilesToClear?.some((entry) => !isId(entry))) {
    state[CLEAR_AS_FOUND] = {
      entries: profilesToClear.filter((entry) => !isId(entry)),
    };
  }

  return { kind: "read", value: state };
};

/**
 * The state with a first profile, selected, when none of its profiles could
 * be read; those stay in the file.
 */
export const withAProfile = (state: State, newId: () => string): State =>
  state.profiles.length > 0
    ? state
    : addProfile(state, newProfile(newId(), DEFAULT_PROFILE_NAME));

/**
 * The state Meru starts from when it has none: one profile, selected, as v3
 * creates its first account. `newId` is v3's account id generator,
 * `crypto.randomUUID`, since a profile id is the account id v3 would have made.
 */
export const createInitialState = (newId: () => string): State => {
  const id = newId();

  return {
    version: STATE_VERSION,
    profiles: [newProfile(id, DEFAULT_PROFILE_NAME)],
    selectedProfileId: id,
  };
};

/** v3's partition name, so a profile's session is its v3 account's session. */
export const profilePartition = (profileId: string) => `persist:${profileId}`;

/** The first `name(n)`, counting from 2, that no profile already has. */
export const nextProfileName = (
  state: State,
  name: (n: number) => string
): string => {
  const taken = new Set(state.profiles.map((profile) => profile.name));
  let n = 2;

  while (taken.has(name(n))) {
    n += 1;
  }

  return name(n);
};

/** The profile with no sleep key, as a profile never put to sleep has none. */
const awake = (profile: Profile): Profile => {
  if (profile.asleep === undefined) {
    return profile;
  }

  const { asleep: _asleep, ...rest } = profile;

  return rest as Profile;
};

/**
 * The state with `profileId` selected, its sleep key gone, and the key of
 * the profile it takes over from too: one the file stored asleep while
 * selected read as awake, and stays so once another is selected.
 */
const withSelected = (state: State, profileId: string): State => ({
  ...state,
  profiles: state.profiles.map((profile) =>
    profile.id === profileId || profile.id === state.selectedProfileId
      ? awake(profile)
      : profile
  ),
  selectedProfileId: profileId,
});

/** Appends a profile and selects it. */
export const addProfile = (state: State, profile: Profile): State =>
  withSelected(
    { ...state, profiles: [...state.profiles, profile] },
    profile.id
  );

/**
 * Whether the profile is put to sleep: it has no pages, but its mail is
 * still checked. The selected profile is always awake, since the last awake
 * profile cannot sleep and sleeping the selected one selects another; one a
 * file stores asleep while selected, hand-edited or with every profile
 * asleep, reads as awake, its key kept as found until it is selected away
 * from or woken. Anything but `true` reads as awake and stays as found too.
 */
export const isAsleep = (state: State, profile: Profile) =>
  profile.asleep === true && profile.id !== state.selectedProfileId;

/**
 * Selects the profile, waking it, so selecting is how every way to a
 * sleeping profile wakes it. Nothing when there is no such profile, or it is
 * selected already.
 */
export const selectProfile = (
  state: State,
  profileId: string
): State | undefined =>
  state.selectedProfileId !== profileId &&
  state.profiles.some((profile) => profile.id === profileId)
    ? withSelected(state, profileId)
    : undefined;

/** Whether the profile can be put to sleep: it is awake and not the last awake. */
export const canSleepProfile = (state: State, profileId: string) =>
  state.profiles.some(
    (profile) => profile.id === profileId && !isAsleep(state, profile)
  ) &&
  state.profiles.some(
    (profile) => profile.id !== profileId && !isAsleep(state, profile)
  );

/** The profile with every tab in a window of its own back in the main window. */
const withoutOwnWindows = (profile: Profile): Profile =>
  profile.tabs.some((entry) => isTab(entry) && inOwnWindow(entry))
    ? {
        ...profile,
        tabs: profile.tabs.map((entry) => {
          if (!isTab(entry) || !inOwnWindow(entry)) {
            return entry;
          }

          const { ownWindow: _moved, ...back } = entry;

          return back as Tab;
        }),
      }
    : profile;

/**
 * Puts the profile to sleep, its tabs in windows of their own back in the
 * main window and closed with the rest; the selected profile gives way to the first
 * awake one in the row. Nothing when it cannot sleep.
 */
export const sleepProfile = (
  state: State,
  profileId: string
): State | undefined => {
  if (!canSleepProfile(state, profileId)) {
    return;
  }

  const first = state.profiles.find(
    (profile) => profile.id !== profileId && !isAsleep(state, profile)
  );

  return {
    ...state,
    profiles: state.profiles.map((profile) =>
      profile.id === profileId
        ? { ...withoutOwnWindows(profile), asleep: true }
        : profile
    ),
    selectedProfileId:
      state.selectedProfileId === profileId && first
        ? first.id
        : state.selectedProfileId,
  };
};

/** Whether the profile is listed and some other profile would be left. */
export const canRemoveProfile = (state: State, profileId: string) =>
  state.profiles.some((profile) => profile.id === profileId) &&
  state.profiles.some((profile) => profile.id !== profileId);

/**
 * Removing the selected profile selects the one to its right, or to its left
 * when it was the last, unless that one sleeps: then the first awake profile,
 * as putting it to sleep does, and with none awake that one, woken. Removing
 * another leaves the selection alone. The id goes on the list of profiles
 * whose data is to be deleted. Every entry with the id goes, so a
 * hand-edited file listing it twice never keeps a profile whose data is about
 * to be cleared. Nothing when the profile cannot be removed.
 */
export const removeProfile = (
  state: State,
  profileId: string
): State | undefined => {
  if (!canRemoveProfile(state, profileId)) {
    return;
  }

  const index = state.profiles.findIndex((profile) => profile.id === profileId);
  // Stored first, since the profiles after it take new places.
  const profiles = withColorsStored(state, index + 1).filter(
    (profile) => profile.id !== profileId
  );
  const neighbour = profiles[Math.min(index, profiles.length - 1)];

  const kept = { ...state, profiles };
  const next =
    neighbour && !isAsleep(state, neighbour)
      ? neighbour
      : (profiles.find((profile) => !isAsleep(state, profile)) ?? neighbour);

  return {
    ...(state.selectedProfileId === profileId && next
      ? withSelected(kept, next.id)
      : kept),
    profilesToClear: [
      ...(state.profilesToClear ?? []).filter((id) => id !== profileId),
      profileId,
    ],
  };
};

/**
 * Moves the profile to `toIndex` in the row, the colours of the profiles
 * that change places stored first so none follows its new place. Nothing when it is not listed, the index is
 * outside the row, or it is there already.
 */
export const moveProfile = (
  state: State,
  profileId: string,
  toIndex: number
): State | undefined => {
  const from = state.profiles.findIndex((profile) => profile.id === profileId);

  if (
    from === -1 ||
    !Number.isInteger(toIndex) ||
    toIndex < 0 ||
    toIndex >= state.profiles.length ||
    toIndex === from
  ) {
    return;
  }

  const profiles = withColorsStored(state, Math.min(from, toIndex));
  const [moved] = profiles.splice(from, 1);

  if (!moved) {
    return;
  }

  profiles.splice(toIndex, 0, moved);

  return { ...state, profiles };
};

/** Stores the profile's colour; nothing when it is not listed or has it stored. */
export const setProfileColor = (
  state: State,
  profileId: string,
  color: ProfileColorName
): State | undefined => {
  const profile = state.profiles.find(
    (candidate) => candidate.id === profileId
  );

  if (!profile || profile.color === color) {
    return;
  }

  return {
    ...state,
    profiles: state.profiles.map((candidate) =>
      candidate.id === profileId ? { ...candidate, color } : candidate
    ),
  };
};

/** Takes ids off the list of profiles whose data is to be deleted. */
export const forgetProfilesToClear = (
  state: State,
  profileIds: readonly string[]
): State | undefined =>
  profileIds.length === 0
    ? undefined
    : {
        ...state,
        profilesToClear: (state.profilesToClear ?? []).filter(
          (id) => !profileIds.includes(id)
        ),
      };

/**
 * The ids on the list to clear, split into those whose data may be deleted
 * and those that are still listed as profiles, readable or not, as in a
 * hand-edited file, whose data must never be.
 */
export const sortProfilesToClear = (state: State) => {
  const listed = new Set([
    ...state.profiles.map((profile) => profile.id),
    ...unreadProfileIds(state),
  ]);
  const ids = state.profilesToClear ?? [];

  return {
    clear: ids.filter((id) => !listed.has(id)),
    stillListed: ids.filter((id) => listed.has(id)),
  };
};

export const selectedProfile = (state: State): Profile => {
  const profile = state.profiles.find(
    (candidate) => candidate.id === state.selectedProfileId
  );

  if (!profile) {
    throw new Error("The state holds no selected profile");
  }

  return profile;
};

/**
 * The profile `offset` places from the selected one, wrapping round as v3
 * does; nothing when there is only the one.
 */
export const adjacentProfile = (
  state: State,
  offset: number
): string | undefined => {
  const { profiles } = state;
  const index = profiles.findIndex(
    (profile) => profile.id === state.selectedProfileId
  );

  return profiles.length > 1
    ? profiles.at((index + offset) % profiles.length)?.id
    : undefined;
};

/**
 * The longest name a profile may have, in UTF-16 code units as a text field
 * counts them: room for an email address, which people name profiles by.
 */
export const PROFILE_NAME_MAX_LENGTH = 64;

/**
 * Names the profile `name`, without control characters and trimmed, stored
 * as typed and never translated. Format characters stay, since emoji
 * sequences are built with them.
 * Duplicates are allowed, as in v3. Nothing when the name is empty, too long
 * or what the profile is already called, or there is no such profile.
 */
export const renameProfile = (
  state: State,
  profileId: string,
  name: string
): State | undefined => {
  const trimmed = name.replaceAll(/\p{Cc}/gu, "").trim();
  const profile = state.profiles.find(
    (candidate) => candidate.id === profileId
  );

  if (
    !profile ||
    trimmed === "" ||
    trimmed.length > PROFILE_NAME_MAX_LENGTH ||
    trimmed === profile.name
  ) {
    return;
  }

  return {
    ...state,
    profiles: state.profiles.map((candidate) =>
      candidate.id === profileId ? { ...candidate, name: trimmed } : candidate
    ),
  };
};

/**
 * Whether the profile's Gmail inbox was last seen tabbed. Anything but `true`
 * in the file, absent included, reads as not, and stays as found until the
 * page says otherwise.
 */
export const hasTabbedInbox = (state: State, profileId: string) =>
  state.profiles.find((profile) => profile.id === profileId)?.tabbedInbox ===
  true;

/** Nothing when there is no such profile or it already reads so. */
export const setTabbedInbox = (
  state: State,
  profileId: string,
  tabbed: boolean
): State | undefined =>
  state.profiles.some((profile) => profile.id === profileId) &&
  hasTabbedInbox(state, profileId) !== tabbed
    ? {
        ...state,
        profiles: state.profiles.map((profile) =>
          profile.id === profileId
            ? { ...profile, tabbedInbox: tabbed }
            : profile
        ),
      }
    : undefined;

/**
 * Switches Do Not Disturb on until `until`, `null` for until turned off, or
 * off with `undefined`. Keys a later build put in it stay while it is on, and
 * a value that did not decode is replaced.
 */
export const switchDoNotDisturb = (
  state: State,
  until: number | null | undefined
): State => {
  const { doNotDisturb, [DO_NOT_DISTURB_AS_FOUND]: _asFound, ...rest } = state;

  return until === undefined
    ? rest
    : { ...rest, doNotDisturb: { ...doNotDisturb, until } };
};

/** The state without a Do Not Disturb that ended by `time`, else as it is. */
export const forgetEndedDoNotDisturb = (state: State, time: number): State =>
  state.doNotDisturb?.until !== null &&
  state.doNotDisturb !== undefined &&
  state.doNotDisturb.until <= time
    ? switchDoNotDisturb(state, undefined)
    : state;
