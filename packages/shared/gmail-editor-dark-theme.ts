import css from "./gmail-editor-dark-theme.css";

/**
 * Gmail's rich-text editor, which the dark theme engine must leave alone: Gmail
 * serializes its innerHTML as the draft and as the sent message, so the inline
 * overrides the engine writes would be baked into the mail — recipients, and
 * the sender in a light-themed client, would see near-white text on white.
 *
 * Pass it to the engine's `ignore`, which skips the whole subtree, and inject
 * `GMAIL_EDITOR_DARK_THEME_CSS` beside it. Every view that themes a surface the
 * editor can appear in takes both: the Gmail view's compose and message, and
 * the mail workspace app, which is a pop-out or a compose window Meru opened.
 */
export const GMAIL_EDITOR_SELECTOR = '[contenteditable="true"]';

export const GMAIL_EDITOR_DARK_THEME_CSS: string = css;
