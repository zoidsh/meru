import type { Page } from "@playwright/test";

export const STAND_IN_TITLE = "Gmail stand-in";

/** The name of the text field on the Gmail stand-in. */
export const DRAFT_LABEL = "Draft";

/** Names of the stand-in's parts that Meru's hides take, as a person reads them. */
export const GMAIL_PARTS = {
  logo: "Gmail logo",
  promo: "Workspace offer",
  upgrade: "Upgrade",
  policy: "Programme policies",
  search: "Search mail",
  list: "Messages",
} as const;

/** One pixel, so the logo is an image without a request. */
const PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

/**
 * Just the anchors Meru's hooks into Gmail look for, in Gmail's own
 * attributes and nothing of its classes or layout.
 */
export const GMAIL_MARKUP = `<header>
      <div><div><a href="#inbox"><img alt="${GMAIL_PARTS.logo}" src="${PIXEL}"></a></div></div>
      <form><input aria-label="${GMAIL_PARTS.search}"></form>
      <div data-pep-id="global-pep-gmail" data-rp-onramp-container><a href="#upgrade">${GMAIL_PARTS.upgrade}</a></div>
    </header>
    <div role="main">
      REFRESH_CONTROL
      <div data-rp-onramp-container><p>${GMAIL_PARTS.promo}</p></div>
      <div gh="tl"><table aria-label="${GMAIL_PARTS.list}"><tr><td>Row</td></tr></table></div>
      <div role="contentinfo"><a href="https://www.google.com/gmail/about/policy/">${GMAIL_PARTS.policy}</a></div>
    </div>`;

/** What the stand-in's Refresh says once pressed `n` times. */
export const refreshedTimes = (n: number) => `Refreshed ${n} times`;

/**
 * Gmail's Refresh, which counts a press only as Gmail's does, by the whole
 * pointer and mouse sequence, so `click()` alone is no press. Under another
 * action code it stands for a Refresh Gmail has renamed.
 */
export const refreshMarkup = (
  act: string
) => `<div gh="mtb"><div act="${act}" role="button" tabindex="0">Refresh</div></div>
      <p id="refreshed">${refreshedTimes(0)}</p>
      <script>
        (() => {
          const control = document.querySelector('[act="${act}"]');
          let seen = [];
          let presses = 0;
          for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
            control.addEventListener(type, () => seen.push(type));
          }
          control.addEventListener("mousedown", () => control.focus());
          control.addEventListener("click", () => {
            if (seen.join() === "pointerdown,mousedown,pointerup,mouseup") {
              presses += 1;
              document.getElementById("refreshed").textContent = "Refreshed " + presses + " times";
            }
            seen = [];
          });
        })();
      </script>`;

/** Names of a stand-in thread's parts, as a person reads them. */
export const THREAD_PARTS = {
  message: (n: number) => `Message ${n}`,
  text: (n: number) => `Text of message ${n}`,
  attachment: (n: number) => `attachment-${n}.pdf`,
  quoted: (n: number) => `Quoted in message ${n}`,
  showTrimmed: "Show trimmed content",
} as const;

/**
 * One open message of a thread in Gmail's markup, cut to what the thread
 * features take: its body with the quote Gmail folds behind its toggle, and
 * its attachment block below.
 */
export const threadMessage = (
  n: number
) => `<div role="listitem" aria-label="${THREAD_PARTS.message(n)}">
      <div class="Bk"><div class="G2"><div data-message-id="#msg-a:r${n}"><div class="gs"><div>
        <div class="ii gt adO"><div class="a3s"><div>
          <p>${THREAD_PARTS.text(n)}</p>
          <div class="yj6qo ajU"><div class="ajR" role="button" tabindex="0" aria-label="${THREAD_PARTS.showTrimmed}">•••</div></div>
          <div class="adL"><div class="adm"></div><div class="h5"><p>${THREAD_PARTS.quoted(n)}</p></div></div>
        </div></div></div>
        <div class="hq gt"><div class="hp"></div><span download_url="x"><a href="#download-${n}">${THREAD_PARTS.attachment(n)}</a></span></div>
      </div></div></div></div></div>
    </div>`;

/**
 * An open thread of `count` messages, oldest first, with Gmail's own rules
 * for what it folds: put in the stand-in's main region, as Gmail draws one.
 */
const threadMarkup = (count: number) => `<style>
      .adL, .h5 { display: none; }
      .G2 { border-top: 1px solid gray; }
      [role="listitem"]:first-child .G2 { border-top: none; }
    </style>
    <h2 data-legacy-thread-id="t1">Thread</h2>
    <div role="list">${Array.from({ length: count }, (_, index) => threadMessage(index + 1)).join("")}</div>`;

/** Moves the stand-in to an open thread of `count` messages, as Gmail draws one. */
export const openThread = (view: Page, count: number) =>
  view.evaluate((markup) => {
    document.querySelector('[gh="tl"]')?.setAttribute("hidden", "");
    document
      .querySelector('[role="main"]')
      ?.insertAdjacentHTML("beforeend", markup);
    location.hash = "#inbox/t1";
  }, threadMarkup(count));
