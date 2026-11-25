import type { Entitlement } from "../entitlement.ts";
import type { Overlays } from "../overlay.ts";
import type { Profiles } from "../profiles.ts";

/**
 * Adding a profile, from Settings' Add profile and from a page's Add another
 * account. A new profile is selected, so an open unified inbox, which would
 * stand over it, closes; the free version adds none, and a page's request
 * says so in a toast, since nothing else on screen would.
 */
export const wireAddProfile = ({
  profiles,
  entitlement,
  overlays,
  closeInbox,
}: {
  profiles: Pick<Profiles, "add">;
  entitlement: Pick<Entitlement, "can">;
  overlays: Pick<Overlays, "open">;
  closeInbox: () => void;
}) => {
  const addProfile = async () => {
    const profileId = await profiles.add();

    closeInbox();

    return profileId;
  };

  return {
    addProfile,
    addProfileFromPage: () => {
      if (entitlement.can("profiles")) {
        return addProfile();
      }

      overlays.open({ kind: "toast", message: "one-profile" });

      return Promise.resolve(undefined);
    },
  };
};
