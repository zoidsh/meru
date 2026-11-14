import { isEqual, uniqBy } from "es-toolkit";
import { z } from "zod";

import type { Ids } from "../ports.ts";
import { groupSchema } from "../records/group.ts";
import { idSchema } from "../records/id.ts";
import { profileSchema } from "../records/profile.ts";
import type { ProfilesState } from "../records/profiles-state.ts";
import { tabSchema } from "../records/tab.ts";
import type { Tab } from "../records/tab.ts";
import { parseField } from "../values.ts";
import { panes } from "./layout.ts";
import { orderedProfiles } from "./ordering.ts";
import { repeated } from "./state-validate.ts";
import { groupOfOne } from "./state.ts";

const listOf = <T>(data: unknown, key: string, schema: z.ZodType<T>) => {
  const items = parseField(data, key, z.array(z.unknown())) ?? [];
  const parsed = items.flatMap((item) => {
    const one = schema.safeParse(item);
    return one.success ? [one.data] : [];
  });
  return { dropped: items.length - parsed.length, parsed };
};

export interface Repair {
  readonly ids: Ids;
  /** The state of a first launch, for data that holds no usable profile. */
  readonly fresh: () => ProfilesState;
  /** A tab for a profile left with none. */
  readonly tabFor: (profileId: string) => Tab;
}

/** Keeps whatever of `data` holds together: the profiles and tabs that parse, the groups whose tabs and layout agree, a group of one for each tab left without, and a tab for each profile left with none. */
export const repairState = (
  data: unknown,
  repair: Repair
): { readonly state: ProfilesState; readonly dropped: string[] } => {
  const dropped: string[] = [];
  const read = <T extends { readonly id: string }>(
    key: string,
    schema: z.ZodType<T>
  ) => {
    const list = listOf(data, key, schema);
    const parsed = uniqBy(list.parsed, (item) => item.id);
    const count = list.dropped + list.parsed.length - parsed.length;
    if (count > 0) {
      dropped.push(`${count} ${key}`);
    }
    return parsed;
  };
  const profiles = read("profiles", profileSchema);
  const [first] = orderedProfiles(profiles);
  if (first === undefined) {
    return { dropped: ["every profile"], state: repair.fresh() };
  }
  const profileIds = new Set(profiles.map((profile) => profile.id));
  const tabs = read("tabs", tabSchema).filter((tab) =>
    profileIds.has(tab.profileId)
  );
  const tabsById = new Map(tabs.map((tab) => [tab.id, tab]));
  const claimed = new Set<string>();
  const paneIds = new Set<string>();
  const groups = read("groups", groupSchema).filter((group) => {
    const shown = panes(group.layout);
    const holds =
      profileIds.has(group.profileId) &&
      group.tabIds.length > 0 &&
      repeated(group.tabIds).length === 0 &&
      group.tabIds.every(
        (id) =>
          tabsById.get(id)?.profileId === group.profileId && !claimed.has(id)
      ) &&
      isEqual(
        shown.flatMap((pane) => pane.tabIds).toSorted(),
        group.tabIds.toSorted()
      ) &&
      shown.every((pane) => !paneIds.has(pane.paneId));
    if (holds) {
      for (const id of group.tabIds) {
        claimed.add(id);
      }
      for (const pane of shown) {
        paneIds.add(pane.paneId);
      }
    } else {
      dropped.push(`group ${group.id}`);
    }
    return holds;
  });
  for (const tab of tabs) {
    if (!claimed.has(tab.id)) {
      groups.push(groupOfOne(tab, repair.ids));
    }
  }
  for (const profile of profiles) {
    if (!tabs.some((tab) => tab.profileId === profile.id)) {
      const tab = repair.tabFor(profile.id);
      tabs.push(tab);
      groups.push(groupOfOne(tab, repair.ids));
    }
  }
  const selected = z.object({ selectedProfileId: idSchema }).safeParse(data);
  const selectedProfileId =
    selected.success && profileIds.has(selected.data.selectedProfileId)
      ? selected.data.selectedProfileId
      : first.id;
  return { dropped, state: { groups, profiles, selectedProfileId, tabs } };
};
