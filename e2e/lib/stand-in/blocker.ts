import type { IncomingMessage, ServerResponse } from "node:http";

import { page } from "./pages.ts";

/** The Gmail stand-in's message with an ad, a tracker and a pixel in it. */
export const BLOCKER_PATH = "/blocker";

export const BLOCKER_TITLE = "Blocker stand-in";

/**
 * What the message loads, by the name its image is given: an ad on one of
 * Google's ad hosts, which only the network could answer; Gmail's own
 * telemetry beacon, a tracker on a first-party host; an open-tracking pixel
 * behind Gmail's image proxy, which keeps the pixel's own URL in the
 * fragment; and a sender's logo behind the same proxy, which is never
 * blocked.
 */
export const BLOCKER_IMAGES = {
  ad: "An ad",
  telemetry: "Gmail's telemetry",
  pixel: "A tracking pixel",
  logo: "The sender's logo",
} as const;

export type BlockerImage = keyof typeof BLOCKER_IMAGES;

/** The stand-in's own paths, which it answers with an image. */
const IMAGE_PATHS: Partial<Record<BlockerImage, string>> = {
  telemetry: "/mail/u/0/generate_204",
  pixel: "/meips/pixel",
  logo: "/meips/logo",
};

const sources = (origin: string): Record<BlockerImage, string> => ({
  ad: "https://ad.doubleclick.net/pagead/viewthroughconversion.gif",
  telemetry: `${origin}${IMAGE_PATHS.telemetry?.slice(1)}?atyp=i`,
  pixel: `${origin}${IMAGE_PATHS.pixel?.slice(1)}=s0-d-e1-ft#https://email.airbnb.com/wf/open?upn=abc`,
  logo: `${origin}${IMAGE_PATHS.logo?.slice(1)}=s0-d-e1-ft#https://example.com/logo.png`,
});

// A transparent 1×1 GIF.
const GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

/**
 * The message, which lists each image as loaded or blocked as it settles,
 * and the images the stand-in serves, each asked-for path recorded.
 */
export const createBlockerPage = (origin: () => string) => {
  const served: BlockerImage[] = [];

  const answer = (request: IncomingMessage, response: ServerResponse) => {
    const path = request.url?.split(/[?=]/u, 1)[0] ?? "";

    if (path === BLOCKER_PATH) {
      const images = Object.entries(sources(origin()))
        .map(
          ([name, src]) =>
            `<li><img src="${src}" alt="" data-name="${BLOCKER_IMAGES[name as BlockerImage]}"> <span>${BLOCKER_IMAGES[name as BlockerImage]}: loading</span></li>`
        )
        .join("");

      response
        .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        .end(
          page(
            BLOCKER_TITLE,
            `<ul aria-label="Images">${images}</ul>
    <script>
      for (const image of document.images) {
        const settle = (word) => {
          image.nextElementSibling.textContent = image.dataset.name + ": " + word;
        };
        if (image.complete) {
          settle(image.naturalWidth > 0 ? "loaded" : "blocked");
        }
        image.addEventListener("load", () => settle("loaded"));
        image.addEventListener("error", () => settle("blocked"));
      }
    </script>`
          )
        );

      return true;
    }

    const image = (Object.keys(IMAGE_PATHS) as BlockerImage[]).find(
      (name) => IMAGE_PATHS[name] === path
    );

    if (!image) {
      return false;
    }

    served.push(image);
    response
      .writeHead(200, {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store",
      })
      .end(GIF);

    return true;
  };

  return { answer, served };
};
