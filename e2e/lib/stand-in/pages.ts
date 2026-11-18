export const CALENDAR_TITLE = "Calendar stand-in";

/** A word the Calendar stand-in's page has `FIND_MATCHES` times, for Find. */
export const FIND_WORD = "standup";

export const FIND_MATCHES = 3;

export const FIND_LINE = `<p id="find-line">Monday standup, Wednesday standup, Friday standup.</p>`;

/** Where the Calendar stand-in moves within its page, as Gmail opens a thread. */
export const THREAD_PATH = "/thread";

/** The Calendar stand-in's frame, which loads into its page on a click. */
export const FRAME_PATH = "/frame";

/**
 * Open thread moves to `THREAD_PATH` within the page, with `FIND_WORD` there
 * once; Load a frame loads one into the page, with no `FIND_WORD` in it.
 */
export const FIND_MOVES = `<button type="button" id="open-thread">Open thread</button>
    <button type="button" id="load-frame">Load a frame</button>
    <script>
      document.getElementById("open-thread").addEventListener("click", () => {
        history.pushState(null, "", "${THREAD_PATH}");
        document.getElementById("find-line").textContent = "Thread: the standup moved.";
      });
      document.getElementById("load-frame").addEventListener("click", () => {
        const frame = document.createElement("iframe");
        frame.title = "Frame";
        frame.src = "${FRAME_PATH}";
        document.body.append(frame);
      });
    </script>`;

export const DRIVE_TITLE = "Drive stand-in";

export const POPUP_TITLE = "Stand-in pop-up";

export const POPUP_PATH = "/popup";

export const POPOUT_TITLE = "Gmail pop-out stand-in";

/** Where Gmail's pop-outs are: compose, a message, an attachment. */
export const POPOUT_PATH = "/mail/u/0/popout";

export const FULL_MESSAGE_TITLE = "Gmail full message stand-in";

/** Gmail's "View entire message" and print pages, told apart by query. */
export const FULL_MESSAGE_PATH = "/mail/u/0/";

/** A pop-out whose first load is redirected to another site. */
export const POPOUT_REDIRECT_PATH = "/mail/u/0/popout-redirect";

/** The size the stand-in's pop-out asks for, as Gmail's features string does. */
export const POPOUT_SIZE = { width: 640, height: 480 };

/** Where the Calendar stand-in's link to its next week goes. */
export const NEXT_WEEK_PATH = "/week/2";

/** Where the Calendar stand-in's link to Gmail goes, after Gmail's URL. */
export const GMAIL_LINK_HASH = "#inbox/from-calendar";

/** Where the stand-in's link to another site points. */
export const ELSEWHERE_URL = "https://example.com/elsewhere";

/** Where the feed sends a signed-out account, which Gmail's view can show too. */
export const SIGN_IN_PATH = "/signin";

export const SIGN_IN_TITLE = "Sign-in stand-in";

/** The page Meru's keep-alive loads on sign-in's origin, as Google's has it. */
export const ROTATION_PATH = "/RotateCookiesPage";

export const ROTATION_TITLE = "Rotation stand-in";

/**
 * A Drive page whose field takes focus as it loads and again whenever it
 * loses it, as Google's sign-in page does with its own.
 */
export const GRABBY_PATH = "/grabby";

export const GRABBY_TITLE = "Grabby stand-in";

export const GRABBY_FIELD = `<input id="grabby" aria-label="Email or phone">
    <script>
      const field = document.getElementById("grabby");
      field.focus();
      field.addEventListener("blur", () =>
        setTimeout(() => {
          window.focus();
          field.focus();
        }, 0)
      );
      window.addEventListener("focus", () => field.focus());
    </script>`;

export const page = (title: string, links: string) => `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>${title}</title></head>
  <body>
    <h1>${title}</h1>
    ${links}
  </body>
</html>`;

export const ELSEWHERE_LINK = `<a href="${ELSEWHERE_URL}" target="_blank">Another site</a>`;

/** Says whether the page has the window that opened it, as Gmail's pop-outs need. */
export const OPENER_LINE = `<p id="opener"></p>
    <script>document.getElementById("opener").textContent = window.opener ? "Has an opener" : "Has no opener";</script>`;

/** Gmail's own windows, each `window.open`ed as Gmail asks for it. */
export const gmailWindowLinks = (
  signIn: string
) => `<button type="button" onclick="window.open('${POPOUT_PATH}?ver=1#cmid%253D1', 'popout', 'width=${POPOUT_SIZE.width},location=0,height=${POPOUT_SIZE.height},left=40,top=40,resizable=1,scrollbars=1')">Pop out compose</button>
    <a href="${FULL_MESSAGE_PATH}?ui=2&amp;ik=1&amp;view=lg&amp;permmsgid=msg-a:r1" target="_blank">View entire message</a>
    <a href="https://www.google.com/url?q=${encodeURIComponent(ELSEWHERE_URL)}&amp;source=gmail&amp;ust=1&amp;usg=x" target="_blank">A link in mail</a>
    <a href="${signIn}AddSession?continue=x" target="_blank">Add another account</a>
    <button type="button" onclick="window.open('about:blank')">Open a blank window</button>
    <button type="button" onclick="window.open('${POPOUT_REDIRECT_PATH}', 'redirected', 'width=${POPOUT_SIZE.width},height=${POPOUT_SIZE.height}')">Pop out elsewhere</button>`;
