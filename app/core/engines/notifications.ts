import type { FeedEntry } from "../records/feed.ts";
import type { Platform } from "../records/platform.ts";

/** Which of the mail that arrived to notify about: all of it, or only what the Important feed lists; without that feed, all, since a missed notification costs more than an extra one. */
export const notifiable = (
  arrived: readonly FeedEntry[],
  newEmails: "all" | "important",
  important: ReadonlySet<string> | undefined
): readonly FeedEntry[] =>
  newEmails === "all" || important === undefined
    ? arrived
    : arrived.filter((entry) => important.has(entry.id));

export interface MailNotice {
  readonly title: string;
  readonly subtitle?: string;
  readonly body?: string;
}

export interface MailNoticeOptions {
  readonly platform: Platform;
  readonly profileLabel: string;
  /** Names the profile before the sender, for someone with several. */
  readonly labelled: boolean;
  readonly showSender: boolean;
  readonly showSubject: boolean;
  readonly showSummary: boolean;
}

/** What a notification of new mail says: the sender, or the profile when the sender is hidden; the subject under it on macOS, which has a subtitle, and above the snippet elsewhere. */
export const mailNotice = (
  entry: FeedEntry,
  options: MailNoticeOptions
): MailNotice => {
  const { platform, profileLabel, labelled } = options;
  const sender =
    entry.author.name === "" ? entry.author.email : entry.author.name;
  let title = profileLabel;
  if (options.showSender) {
    title = labelled ? `[${profileLabel}] ${sender}` : sender;
  }
  const subject =
    options.showSubject && entry.subject !== "" ? entry.subject : undefined;
  const summary =
    options.showSummary && entry.summary !== "" ? entry.summary : undefined;
  if (platform === "darwin") {
    return {
      title,
      ...(subject === undefined ? {} : { subtitle: subject }),
      ...(summary === undefined ? {} : { body: summary }),
    };
  }
  const lines = [subject, summary].filter((line) => line !== undefined);
  return { title, ...(lines.length === 0 ? {} : { body: lines.join("\n") }) };
};

/** The Gmail address that opens a message in a profile's pane. */
export const messageUrl = (messageId: string): string =>
  `https://mail.google.com/mail/u/0/#inbox/${messageId}`;
