import { useLingui } from "@lingui/react/macro";
import { useId, useRef, useState } from "react";

import type { BrowsingDataKinds } from "#core/browsing-data.ts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#ui/alert-dialog.tsx";
import { Button } from "#ui/button.tsx";
import { Checkbox } from "#ui/checkbox.tsx";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#ui/field.tsx";

import { settingsCalls } from "./sync.ts";

// As v3 asks: the cache alone unless the person also chooses to sign out.
const DEFAULT_KINDS: BrowsingDataKinds = { cookies: false, cache: true };

const KindBox = ({
  checked,
  disabled,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  description: string;
  onChange: (checked: boolean) => void;
}) => {
  const id = useId();
  const descriptionId = useId();

  return (
    <Field orientation="horizontal">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        aria-describedby={descriptionId}
        onCheckedChange={onChange}
      />
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      </FieldContent>
    </Field>
  );
};

/**
 * Delete browsing data… and its dialog, which asks which of the profile's
 * data to delete and stays open while it is deleted.
 */
export const DeleteBrowsingData = ({
  profileId,
  name,
  describedBy,
  onDeleted,
}: {
  profileId: string;
  /** The profile's name, as its sign-out is told. */
  name: string;
  describedBy: string;
  onDeleted: () => void;
}) => {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [kinds, setKinds] = useState(DEFAULT_KINDS);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const errorId = useId();

  const run = async () => {
    setRunning(true);
    setFailed(false);

    try {
      await settingsCalls().deleteBrowsingData({ profileId, ...kinds });
      setRunning(false);
      setOpen(false);
      onDeleted();
    } catch {
      setRunning(false);
      setFailed(true);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // What is under way finishes before the dialog goes.
        if (running) {
          return;
        }

        if (next) {
          setKinds(DEFAULT_KINDS);
          setFailed(false);
        }

        setOpen(next);
      }}
    >
      <AlertDialogTrigger
        render={
          <Button variant="outline" size="sm" aria-describedby={describedBy} />
        }
      >
        {t({
          message: "Delete browsing data…",
          comment:
            "Button on a profile's page in Settings that opens a dialog asking which of its browsing data to delete",
        })}
      </AlertDialogTrigger>
      <AlertDialogContent initialFocus={cancel}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t({
              message: "Delete browsing data",
              comment:
                "Title of the dialog in Settings that deletes a profile's browsing data",
            })}
          </AlertDialogTitle>
        </AlertDialogHeader>
        <FieldGroup>
          <KindBox
            checked={kinds.cookies}
            disabled={running}
            label={t({
              message: "Cookies and other site data",
              comment:
                "Checkbox in the Delete browsing data dialog in Settings, as in Chrome's own dialog",
            })}
            description={t({
              message: `Signs you out of ${name}.`,
              comment:
                "Description of Cookies and other site data in the Delete browsing data dialog; {name} is the profile's name",
            })}
            onChange={(cookies) => {
              setKinds({ ...kinds, cookies });
            }}
          />
          <KindBox
            checked={kinds.cache}
            disabled={running}
            label={t({
              message: "Cached images and files",
              comment:
                "Checkbox in the Delete browsing data dialog in Settings, as in Chrome's own dialog",
            })}
            description={t({
              message: "Some pages may load more slowly the next time.",
              comment:
                "Description of Cached images and files in the Delete browsing data dialog in Settings",
            })}
            onChange={(cache) => {
              setKinds({ ...kinds, cache });
            }}
          />
          {failed && (
            <FieldError id={errorId}>
              {t({
                message:
                  "Meru couldn't delete this profile's browsing data. Try again.",
                comment:
                  "Under the checkboxes of the Delete browsing data dialog in Settings, when deleting failed",
              })}
            </FieldError>
          )}
        </FieldGroup>
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancel} disabled={running}>
            {t({
              message: "Cancel",
              comment:
                "Button in the Delete browsing data dialog in Settings that closes it, deleting nothing",
            })}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={running || (!kinds.cookies && !kinds.cache)}
            aria-describedby={failed ? errorId : undefined}
            onClick={() => {
              void run();
            }}
          >
            {t({
              message: "Delete data",
              comment:
                "Button in the Delete browsing data dialog in Settings that deletes what is checked",
            })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
