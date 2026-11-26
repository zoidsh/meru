import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";
import { useId, useRef } from "react";

import type { App } from "#core/apps.ts";
import { AppIcon } from "#shared/app-icon.tsx";
import { Button } from "#ui/button.tsx";
import { Checkbox } from "#ui/checkbox.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#ui/dialog.tsx";
import { Label } from "#ui/label.tsx";
import { ScrollArea } from "#ui/scroll-area.tsx";
import { Table, TableBody, TableCell, TableRow } from "#ui/table.tsx";

import { settingsCalls } from "./sync.ts";

const AppRow = ({ app, checked }: { app: App; checked: boolean }) => {
  const id = useId();

  return (
    <TableRow>
      <TableCell className="w-0">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(on) => {
            settingsCalls()
              .setAppInDefaultBrowser({ app: app.id, on })
              .catch(noop);
          }}
        />
      </TableCell>
      <TableCell>
        <Label htmlFor={id}>
          <AppIcon app={app.id} aria-hidden className="size-4" />
          {app.name}
        </Label>
      </TableCell>
    </TableRow>
  );
};

/**
 * Always open in your default browser's Manage… and its dialog, a checkbox
 * per app, each change saved as it is made.
 */
export const AppsInBrowserDialog = ({
  apps,
  chosen,
  title,
  disabled,
  describedBy,
}: {
  /** In the launcher's order. */
  apps: readonly App[];
  chosen: readonly string[];
  /** The row's label, which the dialog is titled with. */
  title: string;
  disabled: boolean;
  describedBy: string;
}) => {
  const { t } = useLingui();
  const list = useRef<HTMLTableElement>(null);

  return (
    <Dialog>
      <DialogTrigger
        disabled={disabled}
        aria-label={t({
          message: "Manage Google apps that open in your default browser",
          comment:
            "Accessible name of the Manage… button in Settings that opens the list of Google apps, such as Calendar or Drive, whose links always open in the default browser",
        })}
        aria-describedby={describedBy || undefined}
        render={<Button variant="outline" size="sm" />}
      >
        {t({
          message: "Manage…",
          comment:
            "Button of the Always open in your default browser row in Settings that opens the list of Google apps to choose from",
        })}
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        initialFocus={() =>
          list.current?.querySelector<HTMLElement>("[role=checkbox]") ?? null
        }
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {t({
              message:
                "Links to the Google apps you check open in your default browser instead of Meru.",
              comment:
                "Description of the Always open in your default browser dialog in Settings, which lists Google apps such as Calendar or Drive with a checkbox each",
            })}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="rounded-lg border [&>[data-slot=scroll-area-viewport]]:max-h-72">
          <Table
            ref={list}
            aria-label={t({
              message: "Google apps",
              comment:
                "Accessible name of the list of Google apps, such as Calendar or Drive, in the Always open in your default browser dialog of Settings",
            })}
          >
            <TableBody>
              {apps.map((app) => (
                <AppRow
                  key={app.id}
                  app={app}
                  checked={chosen.includes(app.id)}
                />
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
        <DialogFooter>
          <DialogClose render={<Button />}>
            {t({
              message: "Done",
              comment:
                "Button that closes the Always open in your default browser dialog in Settings",
            })}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
