import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";
import { XIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { siteName } from "#core/trusted-sites.ts";
import { Button } from "#ui/button.tsx";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#ui/empty.tsx";
import { ScrollArea } from "#ui/scroll-area.tsx";
import { Table, TableBody, TableCell, TableRow } from "#ui/table.tsx";

import { settingsCalls } from "./sync.ts";

/**
 * Trusted sites' Manage… and its dialog, listing each site with its Remove.
 * A removal moves focus to the next row's Remove, else to Done.
 */
export const TrustedSitesDialog = ({
  sites,
  disabled,
  describedBy,
}: {
  sites: readonly string[];
  disabled: boolean;
  describedBy: string;
}) => {
  const { t } = useLingui();
  const removes = useRef<(HTMLButtonElement | null)[]>([]);
  const done = useRef<HTMLButtonElement>(null);
  // The place of the site just removed, to focus once the list without it shows.
  const removed = useRef<number>(undefined);

  useEffect(() => {
    const at = removed.current;

    if (at === undefined) {
      return;
    }

    removed.current = undefined;
    (at < sites.length ? removes.current[at] : done.current)?.focus();
  }, [sites]);

  return (
    <Dialog>
      <DialogTrigger
        disabled={disabled}
        aria-label={t({
          message: "Manage trusted sites",
          comment:
            "Accessible name of the Manage… button in Settings that opens the list of sites whose links open without asking",
        })}
        aria-describedby={describedBy || undefined}
        render={<Button variant="outline" size="sm" />}
      >
        {t({
          message: "Manage…",
          comment:
            "Button of the Trusted sites row in Settings that opens the list of sites whose links open without asking",
        })}
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        initialFocus={() => removes.current[0] ?? done.current}
      >
        <DialogHeader>
          <DialogTitle>
            {t({
              message: "Trusted sites",
              comment:
                "Title of the dialog in Settings listing the sites whose links open in the default browser without asking",
            })}
          </DialogTitle>
          <DialogDescription>
            {t({
              message: "Links to these sites open without asking.",
              comment:
                "Description of the Trusted sites dialog in Settings; asking is the question Meru shows before a link opens in the default browser",
            })}
          </DialogDescription>
        </DialogHeader>
        {sites.length > 0 ? (
          <ScrollArea className="rounded-lg border [&>[data-slot=scroll-area-viewport]]:max-h-72">
            <Table
              aria-label={t({
                message: "Trusted sites",
                comment:
                  "Accessible name of the table of trusted sites in the Trusted sites dialog of Settings",
              })}
            >
              <TableBody>
                {sites.map((site, index) => {
                  const name = siteName(site);

                  return (
                    <TableRow key={site}>
                      <TableCell>{name}</TableCell>
                      <TableCell className="w-0 text-right">
                        <Button
                          ref={(button) => {
                            removes.current[index] = button;
                          }}
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t({
                            message: `Remove ${name}`,
                            comment:
                              "Accessible name of the button in the Trusted sites dialog of Settings that stops trusting the site; {name} is the site, such as example.com",
                          })}
                          title={t({
                            message: "Remove",
                            comment:
                              "Tooltip of the button in the Trusted sites dialog of Settings that stops trusting the site in its row",
                          })}
                          onClick={() => {
                            removed.current = index;
                            settingsCalls()
                              .removeTrustedSite({ site })
                              .catch(noop);
                          }}
                        >
                          <XIcon />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>
                {t({
                  message: "No trusted sites",
                  comment:
                    "Shown in the Trusted sites dialog of Settings when no site is trusted",
                })}
              </EmptyTitle>
              <EmptyDescription>
                {t({
                  message: "Sites you trust when Meru asks show up here.",
                  comment:
                    "Shown in the Trusted sites dialog of Settings when no site is trusted; Meru asks before a link opens in the default browser, and the question can trust the link's site",
                })}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <DialogFooter>
          <DialogClose render={<Button ref={done} />}>
            {t({
              message: "Done",
              comment:
                "Button that closes the Trusted sites dialog in Settings",
            })}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
