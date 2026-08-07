import { z } from "zod";
import { isValidCssColorInput } from "./color";
import type { GmailState } from "./gmail";
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

export const tabPersistenceSchema = z.enum(["pinned", "bookmarked"]);

export type TabPersistence = z.infer<typeof tabPersistenceSchema>;

export const savedTabSchema = z.object({
  app: z
    .custom<SupportedWorkspaceApp>((value) => typeof value === "string" && value in workspaceApps)
    .optional(),
  url: z.string(),
  title: z.string(),
  persistence: tabPersistenceSchema,
  loadOnLaunch: z.boolean(),
});

export type SavedTab = z.infer<typeof savedTabSchema>;

export const accountConfigSchema = z.object({
  id: z.string(),
  label: z.string(),
  color: z.enum(accountColors).nullable(),
  selected: z.boolean(),
  notifications: z.boolean(),
  gmail: z.object({
    unreadBadge: z.boolean(),
    delegatedAccountId: z.string().nullable(),
    unifiedInbox: z.boolean(),
  }),
  workspaceApps: z.object({
    savedTabs: z.array(savedTabSchema),
  }),
});

export type AccountConfig = z.infer<typeof accountConfigSchema>;

export type AccountConfigs = AccountConfig[];

export const accountConfigInputSchema = accountConfigSchema
  .pick({
    label: true,
    color: true,
    notifications: true,
  })
  .extend({
    gmail: accountConfigSchema.shape.gmail.pick({ unreadBadge: true, unifiedInbox: true }),
  });

export type AccountConfigInput = z.infer<typeof accountConfigInputSchema>;

export type AccountInstance = {
  config: AccountConfig;
  gmail: GmailState;
};

export type AccountInstances = AccountInstance[];

export const gmailSavedSearchSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  query: z.string().min(1),
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
  label: z.string().min(1),
  color: z.string().min(1).refine(isValidCssColorInput, "Enter a valid hex, rgb, or rgba color"),
  textColor: z.enum(gmailLabelTextColors),
});

export const gmailLabelColorInputSchema = gmailLabelColorSchema.omit({
  id: true,
});

export type GmailLabelColorInput = z.infer<typeof gmailLabelColorInputSchema>;

export type GmailLabelColor = z.infer<typeof gmailLabelColorSchema>;

export type GmailLabelColors = GmailLabelColor[];
