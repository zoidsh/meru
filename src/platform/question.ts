import { dialog } from "electron";

/** A question with a button per answer, every word already translated. */
export interface Question {
  message: string;
  buttons: readonly string[];
  /** The button Escape answers, which is also what a closed dialog answers. */
  cancelId: number;
}

export interface NativeQuestion {
  /** The index of the button chosen. */
  ask: (question: Question) => Promise<number>;
}

/** The system's alert, attached to no window, as the link prompt's is. */
export const createNativeQuestion = (): NativeQuestion => ({
  ask: async ({ message, buttons, cancelId }) => {
    const { response } = await dialog.showMessageBox({
      type: "question",
      message,
      buttons: [...buttons],
      defaultId: 0,
      cancelId,
      noLink: true,
    });

    return response;
  },
});

/** What the end-to-end build's stand-in was asked, and how it answers. */
export interface CapturedQuestions {
  asked: Question[];
  /** The button to answer with; `"cancel"`, the question's cancel button. */
  answer: number | "cancel";
}

/**
 * The end-to-end build's, which never shows a dialog on the desktop the suite
 * shares: each question is kept on `meruTestQuestions.asked` and answered
 * with `meruTestQuestions.answer`, the first button unless a test sets
 * another.
 */
export const createCapturedNativeQuestion = (): NativeQuestion => {
  const captured: CapturedQuestions = { asked: [], answer: 0 };

  Reflect.set(globalThis, "meruTestQuestions", captured);

  return {
    ask: (question) => {
      captured.asked.push(question);

      return Promise.resolve(
        captured.answer === "cancel" ? question.cancelId : captured.answer
      );
    },
  };
};
