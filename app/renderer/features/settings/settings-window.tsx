import { cn } from "cn";
import { groupBy, sortBy } from "es-toolkit";

import { TITLEBAR_HEIGHT } from "../../../core/engines/chrome.ts";
import { msg } from "../../../shared/msg.ts";
import type { Setting } from "../../../shared/settings/define.ts";
import { registry, settingsPages } from "../../../shared/settings/registry.ts";
import type { SettingsPageId } from "../../../shared/settings/registry.ts";
import { Button } from "../../ui/button.tsx";
import { useHash } from "../../use-hash.ts";
import { pageContents } from "./contents.ts";
import { fieldKindOf } from "./field-kind.ts";
import { SettingField } from "./setting-field.tsx";
import { SettingsSection } from "./settings-section.tsx";
import { useSettingsClient } from "./use-settings-client.ts";

const appliesOn = (setting: Setting, platform: string) =>
  setting.platforms?.some((found) => found === platform) ?? true;

const Fields = ({ page }: { readonly page: SettingsPageId }) => {
  const { platform } = useSettingsClient();
  // A list is as wide as the page and as long as it holds, so it comes after the fields that sit on one line.
  const shown = registry.filter(
    (setting) =>
      setting.page === page &&
      fieldKindOf(setting.schema).kind !== "bespoke" &&
      appliesOn(setting, platform)
  );
  const ordered = sortBy(shown, [
    (setting) => fieldKindOf(setting.schema).kind === "multiChoice",
  ]);
  // The page's own settings come first, then each section in the order the registry first names it.
  const sections = Object.entries(
    groupBy(ordered, (setting) => setting.section ?? "")
  ).toSorted(([a], [b]) => Number(a !== "") - Number(b !== ""));
  return sections.map(([heading, settings]) => (
    <SettingsSection
      heading={heading === "" ? undefined : heading}
      key={heading}
    >
      {settings.map((setting) => (
        <SettingField key={setting.key} setting={setting} />
      ))}
    </SettingsSection>
  ));
};

/** 3.x's settings window: the titlebar, the pages down the left, and the page the address names on the right, its fields rendered from the registry. */
export const SettingsWindow = () => {
  const [hash, navigate] = useHash();
  const page =
    settingsPages.find((found) => found.id === hash) ?? settingsPages[0];
  if (page === undefined) {
    return null;
  }
  return (
    <div className="bg-background text-foreground flex h-full flex-col">
      <header
        className="draggable relative shrink-0 select-none"
        style={{ height: TITLEBAR_HEIGHT }}
      >
        <div
          className="absolute top-0 bottom-0 flex items-center justify-center text-sm font-medium"
          style={{
            left: "env(titlebar-area-x, 0)",
            width: "env(titlebar-area-width, 100%)",
          }}
        >
          {msg`Settings`}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label={msg`Settings`}
          className="flex w-58 shrink-0 flex-col gap-1 overflow-y-auto border-r px-3 pb-3"
        >
          {settingsPages.map((found) => (
            <Button
              aria-current={found.id === page.id ? "page" : undefined}
              className={cn(
                "w-full justify-start font-normal",
                found.id !== page.id && "text-muted-foreground"
              )}
              key={found.id}
              onClick={() => {
                navigate(found.id);
              }}
              variant={found.id === page.id ? "secondary" : "ghost"}
            >
              {found.label}
            </Button>
          ))}
        </nav>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-8 py-8">
            <h1 className="text-2xl font-semibold" data-page={page.id}>
              {page.label}
            </h1>
            {pageContents
              .filter((content) => content.page === page.id)
              .map(({ page: id, Content }) => (
                <Content key={id} />
              ))}
            <Fields page={page.id} />
          </div>
        </main>
      </div>
    </div>
  );
};
