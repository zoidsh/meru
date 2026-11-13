import { cn } from "cn";
import { useState } from "react";

import { orderedProfiles } from "../../../core/engines/ordering.ts";
import type { GateRefusal } from "../../../core/entitlement/gate.ts";
import {
  PROFILE_COLORS,
  profileSchema,
} from "../../../core/records/profile.ts";
import { profiles as channels } from "../../../shared/channels/profiles.ts";
import type { ProfilesSnapshot } from "../../../shared/channels/profiles.ts";
import { msg } from "../../../shared/msg.ts";
import type { Message } from "../../../shared/msg.ts";
import { Badge } from "../../ui/badge.tsx";
import { Button } from "../../ui/button.tsx";
import { ChoiceGroup } from "../../ui/choice-group.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog.tsx";
import { Input } from "../../ui/input.tsx";
import { refusalOf } from "../entitlement/refusal.ts";
import type { PageContent } from "../settings/page-content.ts";
import { useDraft } from "../settings/use-draft.ts";
import { useSettingsClient } from "../settings/use-settings-client.ts";
import { useProfiles } from "./use-profiles.ts";

type ShownProfile = ProfilesSnapshot["profiles"][number];

const COLOR_NAMES: Readonly<Record<(typeof PROFILE_COLORS)[number], Message>> =
  {
    "#0090ff": msg`Blue`,
    "#12a594": msg`Teal`,
    "#30a46c": msg`Green`,
    "#3e63dd": msg`Indigo`,
    "#8d8d86": msg`Gray`,
    "#8e4ec6": msg`Purple`,
    "#d6409f": msg`Pink`,
    "#e5484d": msg`Red`,
    "#f76b15": msg`Orange`,
    "#ffc53d": msg`Yellow`,
  };

/** The palette as a row of swatches, one checked; the label takes emoji from the system's own picker. */
const ColorPicker = ({
  label,
  color,
  onPick,
}: {
  readonly label: Message;
  readonly color: string | undefined;
  readonly onPick: (color: string) => void;
}) => (
  <ChoiceGroup
    choices={PROFILE_COLORS.map((swatch) => ({
      children: <span className="sr-only">{COLOR_NAMES[swatch]}</span>,
      style: { backgroundColor: swatch },
      title: COLOR_NAMES[swatch],
      value: swatch,
    }))}
    legend={label}
    name={label}
    onChange={onPick}
    value={color}
    variant="swatches"
  />
);

const RemoveDialog = ({
  profile,
  open,
  onOpenChange,
}: {
  readonly profile: ShownProfile;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) => {
  const client = useSettingsClient();
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{msg`Remove ${profile.label}?`}</DialogTitle>
          <DialogDescription>
            {msg`Meru signs out of this profile and clears its data from this computer, including its saved tabs. Your Google account isn't affected.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {msg`Cancel`}
          </DialogClose>
          <DialogClose
            onClick={() => {
              void client.invoke(channels.remove, { profileId: profile.id });
            }}
            render={<Button variant="destructive" />}
          >
            {msg`Remove profile`}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** One profile, edited in place: its label written once typing pauses, its colour at once, and removing it behind a question; a deactivated one says it is kept. */
const ProfileItem = ({
  profile,
  removable,
}: {
  readonly profile: ShownProfile;
  readonly removable: boolean;
}) => {
  const client = useSettingsClient();
  const [removing, setRemoving] = useState(false);
  const label = useDraft(
    profile.label,
    (text) => text.trim(),
    profileSchema.shape.label,
    (next) => {
      void client.invoke(channels.update, {
        label: next,
        profileId: profile.id,
      });
    }
  );
  return (
    <li
      className="flex flex-col gap-3 rounded-xl border p-4"
      data-deactivated={profile.deactivated ? "" : undefined}
      data-profile-id={profile.id}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full border"
          style={{ backgroundColor: profile.color }}
        />
        <Input
          aria-invalid={!label.valid}
          aria-label={msg`Label`}
          className={cn("max-w-64", profile.deactivated && "opacity-60")}
          onBlur={label.handleBlur}
          onChange={(event) => {
            label.handleChange(event.target.value);
          }}
          value={label.shown}
        />
        {profile.deactivated ? (
          <Badge variant="outline">{msg`Deactivated`}</Badge>
        ) : undefined}
        <div className="ml-auto">
          {removable ? (
            <Button
              onClick={() => {
                setRemoving(true);
              }}
              size="sm"
              variant="ghost"
            >
              {msg`Remove…`}
            </Button>
          ) : undefined}
        </div>
      </div>
      <ColorPicker
        color={profile.color}
        label={msg`Color of ${profile.label}`}
        onPick={(color) => {
          void client.invoke(channels.update, {
            color,
            profileId: profile.id,
          });
        }}
      />
      {profile.deactivated ? (
        <p className="text-muted-foreground text-sm">
          {msg`Meru keeps this profile signed in but doesn't load it. Upgrade to Meru Pro to use it again.`}
        </p>
      ) : undefined}
      <RemoveDialog
        onOpenChange={setRemoving}
        open={removing}
        profile={profile}
      />
    </li>
  );
};

/** Asks for a new profile's label and colour; the gate's refusal stands in for the button while it refuses. */
const AddProfile = ({ refusal }: { readonly refusal: GateRefusal | null }) => {
  const client = useSettingsClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<string | undefined>(undefined);
  const [error, setError] = useState<Message | undefined>(undefined);
  if (refusal !== null) {
    return (
      <p className="text-sm" data-locked="">
        {refusal === "free"
          ? msg`Upgrade to Meru Pro to add more profiles`
          : refusalOf(refusal)}
      </p>
    );
  }
  const create = async () => {
    const created = await client.invoke(channels.create, {
      label: label.trim(),
      ...(color === undefined ? {} : { color }),
    });
    if (created.ok) {
      setOpen(false);
      setLabel("");
      setColor(undefined);
      setError(undefined);
    } else {
      setError(msg`Meru couldn't add the profile: ${created.error.message}`);
    }
  };
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <Button
        onClick={() => {
          setOpen(true);
        }}
        variant="outline"
      >
        {msg`Add profile`}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{msg`Add profile`}</DialogTitle>
          <DialogDescription>
            {msg`A profile for a Google account, with its own tabs and settings.`}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          id="add-profile"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <Input
            aria-label={msg`Label`}
            onChange={(event) => {
              setLabel(event.target.value);
            }}
            placeholder={msg`Work`}
            value={label}
          />
          <ColorPicker color={color} label={msg`Color`} onPick={setColor} />
          {error === undefined ? undefined : (
            <p className="text-destructive text-sm">{error}</p>
          )}
        </form>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {msg`Cancel`}
          </DialogClose>
          <Button
            disabled={label.trim() === ""}
            form="add-profile"
            type="submit"
          >
            {msg`Add profile`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Every profile, deactivated ones included, in the titlebar's order, each edited in place, and a way to add one while the entitlement allows it. */
export const ProfilesPage = () => {
  const snapshot = useProfiles();
  if (snapshot === undefined) {
    return null;
  }
  const shown = orderedProfiles(snapshot.profiles);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <AddProfile refusal={snapshot.newProfileRefusal} />
      </div>
      <ul className="flex flex-col gap-3">
        {shown.map((profile) => (
          <ProfileItem
            key={profile.id}
            profile={profile}
            removable={shown.length > 1}
          />
        ))}
      </ul>
    </div>
  );
};

export const profilesContent: PageContent = {
  Content: ProfilesPage,
  page: "profiles",
};
