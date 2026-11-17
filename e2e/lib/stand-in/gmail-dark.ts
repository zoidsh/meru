import type { Page } from "@playwright/test";

/** Names of the parts of Gmail's page the dark theme takes, as a person reads them. */
export const DARK_PARTS = {
  pane: "Conversation",
  subject: "Dark thread",
  sender: "Stand-in sender",
  body: "Text of the dark thread",
  mimic: "Mail written in Gmail's own classes",
  reply: "Reply",
  compose: "New Message",
  to: "To recipients",
  editor: "Message Body",
} as const;

/** The colour of Gmail Dark's page, which says Gmail is Dark. */
const GMAIL_DARK_PAGE = "rgb(17, 17, 17)";

/**
 * What a sender can write into a body or a draft: Gmail's own classes and
 * roles, a menu, a dialog, a form and a body of Gmail's shape within.
 */
const HOSTILE_MAIL = `<div class="iY"><h2 class="hP">${DARK_PARTS.mimic}</h2><span class="gD" style="color: rgb(200, 0, 0)">Red</span></div>
          <div role="menu"><div class="J-N J-N-JT"><div class="J-N-Jz">Item<div class="J-N-JX"></div></div></div><div class="J-Kh"></div></div>
          <div role="alertdialog"><h3 class="uW2Fw-bHp">Title</h3><label>Label<input></label><span class="mUIrbf-anl">Link</span></div>
          <div class="ii gt"><div class="a3s"><p>Nested</p></div></div>
          <table bgcolor="#ffeecc"><tr><td>Cell</td></tr></table>`;

/**
 * A thread in Gmail's conversation pane and a docked compose, in the classes
 * the dark theme takes and with the white Gmail Dark itself leaves on them.
 * Gmail sets its text colour on the body's `.ii` and on the compose window,
 * and here, unlike Gmail, on nothing inside the editor's cell, so the
 * editor's colour is the card's to keep.
 */
const DARK_PANE = `<style>
      .iY, .AD .aaZ, td.Ap { background-color: rgb(255, 255, 255); }
      .hP, .gD, .a3I { color: rgb(31, 31, 31); }
      .ii, .aoI { color: rgb(34, 34, 34); }
    </style>
    <div class="nH a98 iY" role="region" aria-label="${DARK_PARTS.pane}">
      <h2 class="hP" data-legacy-thread-id="t1">${DARK_PARTS.subject}</h2>
      <div role="list"><div role="listitem"><div data-message-id="#msg-a:r9">
        <span class="gD">${DARK_PARTS.sender}</span>
        <div class="gs"><div class="ii gt"><div class="a3s">
          <p>${DARK_PARTS.body}</p>
          ${HOSTILE_MAIL}
        </div></div></div>
      </div></div></div>
      <span class="ams" role="link" tabindex="0">${DARK_PARTS.reply}</span>
    </div>`;

const DARK_COMPOSE = `<div class="AD"><div class="aoI" role="dialog" aria-label="${DARK_PARTS.compose}">
      <div class="l m"><h2 class="a3E"><div class="a3I">${DARK_PARTS.compose}</div></h2></div>
      <div class="aaZ"><div data-compose-id="c1">
        <div class="aGb"><input class="agP" aria-label="${DARK_PARTS.to}"></div>
        <table><tr><td class="Ap"><div g_editable="true" contenteditable="true" role="textbox" aria-label="${DARK_PARTS.editor}"><p>Draft text</p><div class="aaZ">Pasted</div>${HOSTILE_MAIL.replace(DARK_PARTS.mimic, "Pasted heading")}</div></td></tr></table>
      </div></div>
    </div></div>`;

/**
 * Moves the stand-in to an open thread with a compose docked over it, in
 * Gmail's Dark theme or its Default one.
 */
export const openDarkThread = (view: Page, dark: boolean) =>
  view.evaluate(
    ([pane, compose, page]) => {
      document.body.style.backgroundColor = page;
      document.querySelector('[gh="tl"]')?.setAttribute("hidden", "");
      document
        .querySelector('[role="main"]')
        ?.insertAdjacentHTML("beforeend", pane);
      document.body.insertAdjacentHTML("beforeend", compose);
      location.hash = "#inbox/t1";
    },
    [DARK_PANE, DARK_COMPOSE, dark ? GMAIL_DARK_PAGE : ""] as const
  );

/** Turns Gmail's theme Dark or back, then moves within the page, as Gmail would. */
export const setGmailDark = (view: Page, dark: boolean) =>
  view.evaluate(
    (page) => {
      document.body.style.backgroundColor = page;
      location.hash = `#inbox/t1/${page === "" ? "default" : "dark"}`;
    },
    dark ? GMAIL_DARK_PAGE : ""
  );
