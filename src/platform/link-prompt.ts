import { dialog } from "electron";

export type LinkChoice = "open" | "copy" | "cancel";

/** What the prompt shows, every word already translated. */
export interface LinkQuestion {
  message: string;
  /** The link, as shown. */
  detail: string;
  openLabel: string;
  copyLabel: string;
  cancelLabel: string;
  trustLabel: string;
}

export interface LinkAnswer {
  choice: LinkChoice;
  /** Whether the person ticked to trust the link's site. */
  trust: boolean;
}

export interface LinkPrompt {
  ask: (question: LinkQuestion) => Promise<LinkAnswer>;
}

const CHOICES: readonly LinkChoice[] = ["open", "copy", "cancel"];

/** The system's alert, attached to no window, as v3's is. */
export const createLinkPrompt = (): LinkPrompt => ({
  ask: async ({
    message,
    detail,
    openLabel,
    copyLabel,
    cancelLabel,
    trustLabel,
  }) => {
    const { response, checkboxChecked } = await dialog.showMessageBox({
      type: "question",
      message,
      detail,
      buttons: [openLabel, copyLabel, cancelLabel],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      checkboxLabel: trustLabel,
      checkboxChecked: false,
    });

    return { choice: CHOICES[response] ?? "cancel", trust: checkboxChecked };
  },
});

/**
 * The end-to-end build's prompt, which never shows one on the desktop the
 * suite shares: each question is kept on `meruTestLinkPrompts.asked`, and
 * answered with `meruTestLinkPrompts.answer`, Open Link untrusted unless a
 * test sets another.
 */
export const createCapturedLinkPrompt = (): LinkPrompt => {
  const captured: { asked: LinkQuestion[]; answer: LinkAnswer } = {
    asked: [],
    answer: { choice: "open", trust: false },
  };

  Reflect.set(globalThis, "meruTestLinkPrompts", captured);

  return {
    ask: (question) => {
      captured.asked.push(question);

      return Promise.resolve(captured.answer);
    },
  };
};
