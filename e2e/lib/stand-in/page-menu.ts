import { ELSEWHERE_URL, page } from "./pages.ts";

/** The Calendar stand-in's page of things to right-click. */
export const PAGE_MENU_PATH = "/page-menu";

export const PAGE_MENU_TITLE = "Page menu stand-in";

export const PAGE_MENU_PARTS = {
  plain: "Words to right-click",
  link: "A link to another site",
  mailto: "Write to Ada",
  image: "A square",
  largeImage: "A square past the longest address",
  field: "Note",
  ownMenu: "A row with a menu of its own",
} as const;

export const MAILTO_URL = "mailto:ada@example.com?subject=Hello";

/** A word the field holds that every spell checker marks. */
export const MISSPELT = "recieve";

const square = (padding: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="teal"/>${padding > 0 ? `<!--${"x".repeat(padding)}-->` : ""}</svg>`
  )}`;

/** The image's address, small enough that Chromium reports it. */
export const IMAGE_URL = square(0);

/** Past Chromium's 2 MB limit for a URL. */
const LARGE_IMAGE_URL = square(2 * 1024 * 1024 + 1);

export const PAGE_MENU_PAGE = page(
  PAGE_MENU_TITLE,
  `<p>${PAGE_MENU_PARTS.plain}</p>
    <p><a href="${ELSEWHERE_URL}" target="_blank">${PAGE_MENU_PARTS.link}</a></p>
    <p><a href="${MAILTO_URL}">${PAGE_MENU_PARTS.mailto}</a></p>
    <p><img src="${IMAGE_URL}" alt="${PAGE_MENU_PARTS.image}" width="40" height="40"></p>
    <p><img src="${LARGE_IMAGE_URL}" alt="${PAGE_MENU_PARTS.largeImage}" width="40" height="40"></p>
    <p><textarea aria-label="${PAGE_MENU_PARTS.field}" spellcheck="true" rows="2" cols="30">${MISSPELT}</textarea></p>
    <div role="row" tabindex="0" oncontextmenu="event.preventDefault()">${PAGE_MENU_PARTS.ownMenu}</div>`
);
