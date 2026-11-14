import type { GmailFeature } from "../feature.ts";

export const userStyles: GmailFeature = {
  apply: ({ settings, style }) => {
    style(settings.userStyles);
  },
  id: "userStyles",
};
