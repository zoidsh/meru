import { useLingui } from "@lingui/react/macro";
import { useId, useRef, useState } from "react";

import { Button } from "#ui/button.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#ui/dialog.tsx";
import { Field, FieldDescription, FieldError, FieldLabel } from "#ui/field.tsx";
import { Input } from "#ui/input.tsx";

/** How an activation ended, worded by main where it failed. */
export type ActivationResult =
  | { ok: true }
  | { ok: false; message: string }
  | undefined;

/**
 * Enter license key… or Change…, and the dialog it opens. While the key is
 * being checked nothing in it can be changed and it cannot be closed; a
 * failure shows under the field and keeps it open, success closes it.
 */
export const LicenseDialog = ({
  changing,
  disabled,
  describedBy,
  onActivate,
}: {
  /** A key is stored, so this one replaces it. */
  changing: boolean;
  /** Another license request is out. */
  disabled: boolean;
  describedBy: string;
  /** Sends the key; `undefined` when it could not be sent at all. */
  onActivate: (licenseKey: string) => Promise<ActivationResult>;
}) => {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string>();
  const [running, setRunning] = useState(false);
  // As it opened, so the title holds while the accepted key's state lands.
  const [replacing, setReplacing] = useState(changing);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const descriptionId = useId();
  const errorId = useId();

  const activate = async () => {
    if (running || key.trim() === "") {
      return;
    }

    setRunning(true);
    setError(undefined);

    const result = await onActivate(key);

    setRunning(false);

    if (result?.ok) {
      // The key is the person's; nothing of it stays behind in the page.
      setKey("");
      setOpen(false);

      return;
    }

    if (result) {
      setError(result.message);
    }

    // Focus left with the field while it was disabled.
    requestAnimationFrame(() => {
      input.current?.focus();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // The answer lands before the dialog goes.
        if (running) {
          return;
        }

        if (next) {
          setKey("");
          setError(undefined);
          setReplacing(changing);
        }

        setOpen(next);
      }}
    >
      <DialogTrigger
        disabled={disabled}
        aria-label={
          changing
            ? t({
                message: "Change license key",
                comment:
                  "Accessible name of the Change… button beside the license key on the Meru Pro page of Settings",
              })
            : undefined
        }
        render={
          <Button
            variant="outline"
            size="sm"
            aria-describedby={describedBy || undefined}
          />
        }
      >
        {changing
          ? t({
              message: "Change…",
              comment:
                "Button beside the license key on the Meru Pro page of Settings that opens a dialog to enter another key",
            })
          : t({
              message: "Enter license key…",
              comment:
                "Button on the Meru Pro page of Settings that opens a dialog to enter a license key",
            })}
      </DialogTrigger>
      <DialogContent showCloseButton={false} initialFocus={input}>
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            void activate();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {replacing
                ? t({
                    message: "Change license key",
                    comment:
                      "Title of the dialog on the Meru Pro page of Settings that replaces the license key",
                  })
                : t({
                    message: "Enter license key",
                    comment:
                      "Title of the dialog on the Meru Pro page of Settings where a license key is entered",
                  })}
            </DialogTitle>
          </DialogHeader>
          <Field
            data-invalid={error ? true : undefined}
            data-disabled={running || undefined}
          >
            <FieldLabel htmlFor={inputId}>
              {t({
                message: "License key",
                comment:
                  "Label of the field in the license key dialog on the Meru Pro page of Settings",
              })}
            </FieldLabel>
            <Input
              ref={input}
              id={inputId}
              value={key}
              disabled={running}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              placeholder={t({
                message: "MERU-XXXX-XXXX-XXXX-XXXX-XXXX",
                comment:
                  "Placeholder of the license key field, showing a key's shape; MERU stays as it is and each X stands for a letter or digit",
              })}
              aria-invalid={error ? true : undefined}
              aria-describedby={
                error ? `${descriptionId} ${errorId}` : descriptionId
              }
              onChange={(event) => {
                setKey(event.target.value);
              }}
            />
            <FieldDescription id={descriptionId}>
              {t({
                message:
                  "You'll find it in the email you got when you bought Meru Pro.",
                comment:
                  "Description of the License key field on the Meru Pro page of Settings",
              })}
            </FieldDescription>
            {error && <FieldError id={errorId}>{error}</FieldError>}
          </Field>
          <DialogFooter>
            <DialogClose
              disabled={running}
              render={<Button type="button" variant="outline" />}
            >
              {t({
                message: "Cancel",
                comment:
                  "Button in the license key dialog of Settings that closes it, changing nothing",
              })}
            </DialogClose>
            <Button type="submit" disabled={running || key.trim() === ""}>
              {t({
                message: "Activate",
                comment:
                  "Button in the license key dialog of Settings that checks the key and, once it is accepted, unlocks Meru Pro on this computer",
              })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
