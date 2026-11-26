import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";
import { MonitorIcon, AppWindowIcon } from "lucide-react";
import { useId, useState } from "react";
import type { KeyboardEvent } from "react";

import type { ShellState } from "#contract/shell.ts";
import type { TabKey } from "#core/tabs.ts";
import { Button } from "#ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "#ui/empty.tsx";
import { Field, FieldLabel, FieldTitle } from "#ui/field.tsx";
import { RadioGroup, RadioGroupItem } from "#ui/radio-group.tsx";
import { Skeleton } from "#ui/skeleton.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#ui/tabs.tsx";

import { shellCalls, useShellState } from "./sync.ts";
import { TitledOverlay, TitledOverlayBody } from "./titled-overlay.tsx";

export type PickerCard = NonNullable<ShellState["screenPicker"]>;

type Source = Extract<PickerCard, { kind: "listed" }>["windows"][number];

type SourceTab = "windows" | "screens";

/** Three thumbnails a row, as many rows as a skeleton shows. */
const GRID = "grid grid-cols-3 gap-3 p-1";

const SKELETONS = ["a", "b", "c"];

const Footer = ({ children }: { children: React.ReactNode }) => (
  <div className="flex justify-end gap-2 pt-4">{children}</div>
);

/**
 * The sources of one tab, as radios drawn as cards: a thumbnail with the
 * name under it, chosen by pointer or arrow keys, shared by a double-click
 * or Enter.
 */
const SourceGrid = ({
  sources,
  selected,
  label,
  onSelect,
  onShare,
}: {
  sources: Source[];
  selected: string | undefined;
  label: string;
  onSelect: (id: string) => void;
  onShare: (id: string) => void;
}) => {
  const idPrefix = useId();

  return (
    <RadioGroup
      aria-label={label}
      value={selected ?? null}
      onValueChange={(value) => {
        if (typeof value === "string") {
          onSelect(value);
        }
      }}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === "Enter" && selected !== undefined) {
          event.preventDefault();
          onShare(selected);
        }
      }}
      className={GRID}
    >
      {sources.map((source, index) => {
        const id = `${idPrefix}-${index}`;

        return (
          <FieldLabel
            key={source.id}
            htmlFor={id}
            onDoubleClick={() => {
              onShare(source.id);
            }}
            className="min-w-0"
          >
            <Field>
              {/* Names the radio, its name under it said once. */}
              <img
                src={source.thumbnail}
                alt={source.name}
                draggable={false}
                className="aspect-video w-full rounded-md bg-muted object-contain"
              />
              <div className="flex min-w-0 items-center gap-2">
                <RadioGroupItem id={id} value={source.id} />
                <FieldTitle
                  aria-hidden
                  className="block min-w-0 truncate"
                  title={source.name}
                >
                  {source.name}
                </FieldTitle>
              </div>
            </Field>
          </FieldLabel>
        );
      })}
    </RadioGroup>
  );
};

/**
 * Meru's picker for the screen or window a page asks to share: Windows
 * first, then Screens, each a grid to choose from, and Share, which is the
 * default and waits for a choice; Cancel, Escape and a press outside answer
 * the page with nothing. Drawn over the main window's page, or with
 * `window` in that tab's own window.
 */
export const ScreenPicker = ({
  card,
  window,
}: {
  card: PickerCard;
  window?: TabKey;
}) => {
  const { t } = useLingui();
  const titleId = useId();
  const [tab, setTab] = useState<SourceTab>("windows");
  const [selected, setSelected] = useState<string>();
  const calls = shellCalls();
  const target = window && { profileId: window.profileId, tabId: window.tabId };
  const cancel = () => {
    calls.cancelScreenPicker({ window: target }).catch(noop);
  };
  const share = (source: string) => {
    calls.shareScreen({ source, window: target }).catch(noop);
  };
  const title = t({
    message: "Choose what to share",
    comment:
      "Title of the card Meru shows when a meeting asks to share the screen, listing the windows and screens to choose from",
  });
  const cancelButton = (
    <Button variant="outline" size="sm" onClick={cancel}>
      {t({
        message: "Cancel",
        comment:
          "Button of the screen sharing card that closes it and shares nothing",
      })}
    </Button>
  );

  if (card.kind === "denied") {
    return (
      <TitledOverlay
        kind="screen-picker"
        title={title}
        titleId={titleId}
        description={t({
          message: "Meru needs permission to record your screen.",
          comment:
            "On the screen sharing card when macOS does not let Meru record the screen; the button under it opens the system's settings for it",
        })}
      >
        <Footer>
          {cancelButton}
          <Button
            size="sm"
            autoFocus
            onClick={() => {
              calls.openScreenRecordingSettings({}).catch(noop);
            }}
          >
            {t({
              message: "Open System Settings",
              comment:
                "Button of the screen sharing card that opens the Screen Recording page of macOS's System Settings, named as macOS names that app",
            })}
          </Button>
        </Footer>
      </TitledOverlay>
    );
  }

  if (card.kind === "failed" || card.kind === "gone") {
    return (
      <TitledOverlay
        kind="screen-picker"
        title={title}
        titleId={titleId}
        description={
          card.kind === "failed"
            ? t({
                message: "Couldn't list your screens and windows.",
                comment:
                  "On the screen sharing card when Meru could not get the list of screens and windows to share",
              })
            : t({
                message: "That window is no longer open.",
                comment:
                  "On the screen sharing card when the window or screen chosen to share closed before Share was clicked, so nothing is shared",
              })
        }
      >
        <Footer>
          {card.kind === "failed" ? (
            <>
              {cancelButton}
              <Button
                size="sm"
                autoFocus
                onClick={() => {
                  calls.retryScreenPicker({ window: target }).catch(noop);
                }}
              >
                {t({
                  message: "Try again",
                  comment:
                    "Button of the screen sharing card that asks for the list of screens and windows again after it could not be had",
                })}
              </Button>
            </>
          ) : (
            <Button size="sm" autoFocus onClick={cancel}>
              {t({
                message: "Close",
                comment:
                  "Button of the screen sharing card that closes it once it says the window chosen is no longer open",
              })}
            </Button>
          )}
        </Footer>
      </TitledOverlay>
    );
  }

  const tabs: { value: SourceTab; label: string; empty: string }[] = [
    {
      value: "windows",
      label: t({
        message: "Windows",
        comment:
          "Tab of the screen sharing card listing the open app windows to share, never the Windows operating system",
      }),
      empty: t({
        message: "No windows to share.",
        comment:
          "In the Windows tab of the screen sharing card when no app window can be shared",
      }),
    },
    {
      value: "screens",
      label: t({
        message: "Screens",
        comment: "Tab of the screen sharing card listing the displays to share",
      }),
      empty: t({
        message: "No screens to share.",
        comment:
          "In the Screens tab of the screen sharing card when no display can be shared",
      }),
    },
  ];
  const listed = card.kind === "listed" ? card : undefined;
  const shown = listed?.[tab] ?? [];
  const chosen = shown.some(({ id }) => id === selected) ? selected : undefined;

  return (
    <TitledOverlay kind="screen-picker" title={title} titleId={titleId}>
      <TitledOverlayBody>
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value as SourceTab);
          }}
          className="min-h-0 px-2"
        >
          <TabsList>
            {tabs.map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                autoFocus={value === "windows"}
              >
                {value === "windows" ? (
                  <AppWindowIcon aria-hidden />
                ) : (
                  <MonitorIcon aria-hidden />
                )}
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map(({ value, label, empty }) => {
            const sources = listed?.[value] ?? [];
            let content: React.ReactNode;

            if (!listed) {
              content = (
                <div className={GRID} aria-busy>
                  {SKELETONS.map((key) => (
                    <div key={key} className="flex flex-col gap-2 p-2.5">
                      <Skeleton className="aspect-video w-full" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  ))}
                </div>
              );
            } else if (sources.length === 0) {
              content = (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      {value === "windows" ? (
                        <AppWindowIcon />
                      ) : (
                        <MonitorIcon />
                      )}
                    </EmptyMedia>
                    <EmptyDescription>{empty}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              );
            } else {
              content = (
                <SourceGrid
                  sources={sources}
                  selected={chosen}
                  label={label}
                  onSelect={setSelected}
                  onShare={share}
                />
              );
            }

            return (
              <TabsContent
                key={value}
                value={value}
                className="no-scrollbar min-h-0 overflow-y-auto"
              >
                {content}
              </TabsContent>
            );
          })}
        </Tabs>
        <div className="px-2 pb-2">
          <Footer>
            {cancelButton}
            <Button
              size="sm"
              disabled={chosen === undefined}
              onClick={() => {
                if (chosen !== undefined) {
                  share(chosen);
                }
              }}
            >
              {t({
                message: "Share",
                context: "screen sharing",
                comment:
                  "Button of the screen sharing card that shares the window or screen chosen with the meeting",
              })}
            </Button>
          </Footer>
        </div>
      </TitledOverlayBody>
    </TitledOverlay>
  );
};

/** The picker over the main window's page, while main has one there. */
export const MainScreenPicker = () => {
  const card = useShellState("screenPicker");

  return card ? <ScreenPicker card={card} /> : null;
};
