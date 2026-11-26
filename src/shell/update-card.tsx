import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";

import type { ShellState } from "#contract/shell.ts";
import type { UpdateCardAction } from "#core/updates.ts";
import { Button } from "#ui/button.tsx";
import { Card, CardContent } from "#ui/card.tsx";

import { shellCalls } from "./sync.ts";

const run = (action: UpdateCardAction) => {
  shellCalls().runUpdateCard({ action }).catch(noop);
};

/**
 * The card at the page's bottom right once a version is ready to install
 * or could not be verified. It takes no focus as it comes; a click puts the
 * keys in it, Tab moves among its buttons and Escape is Later or Close.
 */
export const UpdateCard = ({
  card,
  version,
}: Extract<ShellState["overlay"], { kind: "update" }>) => {
  const { t } = useLingui();
  const ready = card === "ready";

  return (
    <div className="fixed right-2 bottom-2 w-80 max-w-[calc(100vw-8px)]">
      <Card size="sm" data-overlay-card>
        <CardContent className="flex flex-col gap-3">
          {/* The view main sizes for the card holds three lines. */}
          <output className="line-clamp-3">
            {ready
              ? t({
                  message: `Meru ${version} is ready. Restart to finish installing it.`,
                  comment:
                    "Card at the bottom right of the main window once a new version has downloaded; {version} is its version number, such as 4.2.0; at most three lines of a narrow card",
                })
              : t({
                  message:
                    "Meru couldn't verify the downloaded update, so it wasn't installed.",
                  comment:
                    "Card at the bottom right of the main window when a downloaded version's signature did not match; at most three lines of a narrow card",
                })}
          </output>
          <div className="flex flex-wrap justify-end gap-2">
            {ready ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    run("whats-new");
                  }}
                >
                  {t({
                    message: "What's new",
                    comment:
                      "Button of the main window's update card that opens the new version's release notes in the default browser",
                  })}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    run("dismiss");
                  }}
                >
                  {t({
                    message: "Later",
                    comment:
                      "Button of the main window's update card that hides it until Meru is opened again; the version still installs when Meru quits",
                  })}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    run("restart");
                  }}
                >
                  {t({
                    message: "Restart now",
                    comment:
                      "Button of the main window's update card that quits Meru, installs the downloaded version and opens Meru again",
                  })}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    run("dismiss");
                  }}
                >
                  {t({
                    message: "Close",
                    comment:
                      "Button of the main window's card saying a downloaded update could not be verified; it hides the card",
                  })}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    run("download");
                  }}
                >
                  {t({
                    message: "Download",
                    comment:
                      "Button of the main window's card saying a downloaded update could not be verified; it opens the version's release page in the default browser, to download it by hand",
                  })}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
