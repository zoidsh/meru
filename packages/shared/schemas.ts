import { z } from "zod";
import { isValidCssColorInput } from "./color";
import type { GmailState } from "./gmail";
import type { VerticalTabsSessionWidth } from "./tabs";
import { type SupportedWorkspaceApp, workspaceApps } from "./workspace-apps";

export const accountColors = [
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
] as const;

const workspaceAppSchema = z.custom<SupportedWorkspaceApp>(
  (value) => typeof value === "string" && value in workspaceApps,
);

/**
 * A pinned tab as it is restored on the next launch. It keeps following the app
 * it holds, so its `url` and `title` are rewritten as the user browses.
 */
export const savedTabSchema = z.object({
  app: workspaceAppSchema,
  url: z.string(),
  title: z.string(),
  loadOnLaunch: z.boolean(),
  /** `null` leaves the tab following the Hibernate idle tabs setting. */
  hibernatesWhenIdle: z.boolean().nullable(),
  windowed: z.boolean(),
  opensLinksForApp: workspaceAppSchema.nullable(),
});

export type SavedTab = z.infer<typeof savedTabSchema>;

/**
 * A saved URL, captured when the bookmark was created. Unlike a saved tab, a
 * bookmark never follows what the user browses to afterwards — opening one
 * loads the URL it was created from.
 */
export const bookmarkSchema = z.object({
  id: z.string(),
  app: workspaceAppSchema,
  url: z.string(),
  title: z.string(),
});

export type Bookmark = z.infer<typeof bookmarkSchema>;

export const accountConfigSchema = z.object({
  id: z.string(),
  label: z.string(),
  color: z.enum(accountColors).nullable(),
  selected: z.boolean(),
  /** Absent on every account written before the switch existed, which means enabled. */
  disabled: z.boolean().optional(),
  notifications: z.boolean(),
  gmail: z.object({
    unreadBadge: z.boolean(),
    delegatedAccountId: z.string().nullable(),
    unifiedInbox: z.boolean(),
    /**
     * Absent on every account written before Hibernate Gmail existed, which
     * means off. Nothing parses a stored account through this schema — the
     * store hands back the raw JSON — so a `.default()` here would promise a
     * boolean the config has never held.
     */
    hibernated: z.boolean().optional(),
    /**
     * The last `window.GM_INBOX_TYPE` a live Gmail page reported, which is what
     * picks the inbox feed. Kept so a hibernated account still chooses the
     * right feed with no page to read it from; absent, and `null`, mean the
     * unsectioned feed.
     */
    inboxType: z.string().nullable().optional(),
  }),
  workspaceApps: z.object({
    savedTabs: z.array(savedTabSchema),
    bookmarks: z.array(bookmarkSchema),
  }),
});

export type AccountConfig = z.infer<typeof accountConfigSchema>;

export type AccountConfigs = AccountConfig[];

/** Tagged with the account it belongs to so that opening or removing it targets the right one. */
export type BookmarkState = Bookmark & {
  accountId: AccountConfig["id"];
};

export const accountConfigInputSchema = accountConfigSchema
  .pick({
    label: true,
    color: true,
    disabled: true,
    notifications: true,
  })
  .extend({
    gmail: accountConfigSchema.shape.gmail.pick({
      unreadBadge: true,
      unifiedInbox: true,
      hibernated: true,
    }),
  });

export type AccountConfigInput = z.infer<typeof accountConfigInputSchema>;

export type AccountInstance = {
  config: AccountConfig;
  gmail: GmailState;
  /**
   * Whether the account is opted into Hibernate Gmail and licensed for it.
   * `config.gmail.hibernated` says what the user asked for; this says what the
   * app is doing.
   */
  hibernated: boolean;
  /** Whether the account's Gmail view exists, which is what "Open Gmail" turns into true. */
  gmailLoaded: boolean;
  /** The width the account's tab strip was last given by hand, for this run. */
  verticalTabsWidth: VerticalTabsSessionWidth | null;
};

export type AccountInstances = AccountInstance[];

export const gmailSavedSearchSchema = z.object({
  id: z.string(),
  label: z.string().min(1, "Enter a label"),
  query: z.string().min(1, "Enter a search query"),
});

export const gmailSavedSearchInputSchema = gmailSavedSearchSchema.omit({
  id: true,
});

export type GmailSavedSearchInput = z.infer<typeof gmailSavedSearchInputSchema>;

export type GmailSavedSearch = z.infer<typeof gmailSavedSearchSchema>;

export type GmailSavedSearches = GmailSavedSearch[];

export const gmailLabelTextColors = ["auto", "white", "black"] as const;

export type GmailLabelTextColor = (typeof gmailLabelTextColors)[number];

export const gmailLabelColorSchema = z.object({
  id: z.string(),
  label: z.string().min(1, "Enter a label"),
  color: z
    .string()
    .min(1, "Enter a color")
    .refine(isValidCssColorInput, "Enter a valid hex, rgb, or rgba color"),
  textColor: z.enum(gmailLabelTextColors),
});

export const gmailLabelColorInputSchema = gmailLabelColorSchema.omit({
  id: true,
});

export type GmailLabelColorInput = z.infer<typeof gmailLabelColorInputSchema>;

export type GmailLabelColor = z.infer<typeof gmailLabelColorSchema>;

export type GmailLabelColors = GmailLabelColor[];
