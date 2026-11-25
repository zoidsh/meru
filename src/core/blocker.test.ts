import { describe, expect, it } from "vitest";

import { createBlockMatcher } from "./blocker.ts";
import type { BlockChoice } from "./blocker.ts";
import { FEED_PATH } from "./feed.ts";
import { KEEP_ALIVE_URL } from "./keep-alive.ts";
import { ACTION_PATH } from "./mail-actions.ts";
import { SIGN_IN_ORIGINS } from "./window-open.ts";

const BOTH: BlockChoice = { ads: true, trackers: true };

const blocked = (
  choice: BlockChoice,
  urls: readonly string[],
  resourceType = "image"
) => {
  const matcher = createBlockMatcher(choice, SIGN_IN_ORIGINS);

  return urls.filter((url) => matcher?.({ url, resourceType }) === true);
};

const ADS = [
  "https://doubleclick.net/instream/ad",
  "https://ad.doubleclick.net/pagead/viewthroughconversion",
  "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
  "https://mail-ads.google.com/mail/main_jspb?rt=r&client=25&pt=ji",
  "https://ep1.adtrafficquality.google/getconfig/sodar",
];

const GOOGLE_TRACKERS = [
  "https://www.google-analytics.com/g/collect",
  "https://www.googletagmanager.com/gtm.js",
  "https://mail.google.com/mail/u/0/generate_204?uaahhg",
  "https://play.google.com/log?format=json&hasfast=true&authuser=0",
  "https://www.google.com/gen_204?foo=bar",
  "https://www.gstatic.com/gen_204?x",
  "https://docs.google.com/csi?v=2&s=docs&action=load",
];

const PIXELS = [
  "https://awstrack.me/open/abc",
  "https://example.com/track/open",
  "https://u123.ct.sendgrid.net/wf/open?upn=abc",
  "https://t.hubspotemail.net/e2t/o/abc",
  // A list entry that starts with a repeated character class.
  "https://news.example.com/e/FooterImages/FooterImage?id=1",
  // Gmail's image proxy keeps the image's own URL in the fragment.
  "https://ci3.googleusercontent.com/meips/ADKq_NbXyz=s0-d-e1-ft#https://email.airbnb.com/wf/open?upn=abc",
  "https://ci3.googleusercontent.com/meips/ADKq_Nb=s0-d-e1-ft#https://stripe.com/trk/abc",
  // A carried URL's scheme in capitals, which a URL's scheme may be.
  "https://ci3.googleusercontent.com/meips/ADKq_Nb=s0-d-e1-ft#HTTPS://email.airbnb.com/wf/open?upn=abc",
];

/**
 * What Meru itself and the apps it shows need: Google's sign-in, Gmail and
 * the other apps, the feed poll and mail actions main sends, the keep-alive
 * page, and downloads. None may ever be blocked.
 */
const PROTECTED = [
  // Sign-in, each of its paths, whatever the list says.
  "https://accounts.google.com/",
  "https://accounts.google.com/o/oauth2/",
  "https://accounts.google.com/ServiceLogin?continue=https://mail.google.com/mail/u/0/",
  "https://accounts.google.com/v3/signin/identifier?flowName=GlifWebSignIn",
  "https://accounts.google.com/gen_204?sign-in-telemetry",
  "https://accounts.google.com/AddSession",
  KEEP_ALIVE_URL,
  // Gmail, and what main sends in a profile's session.
  "https://mail.google.com/mail/u/0",
  "https://mail.google.com/mail/u/0/",
  "https://mail.google.com/mail/u/0/#inbox/FMfcgzQbfxyz",
  "https://mail.google.com/sync/u/0/i/s?hl=en&c=1",
  "https://mail.google.com/mail/u/0/?ui=2&ik=abc&view=cv&th=123",
  `https://mail.google.com${FEED_PATH}`,
  `https://mail.google.com${FEED_PATH}/^i`,
  `https://mail.google.com${ACTION_PATH}?ik=abc&at=xyz&rt=j`,
  "https://mail.google.com/mail/u/0/popout?ver=abc#cmid%3D1",
  // Its assets and images.
  "https://www.gstatic.com/og/_/js/foo.js",
  "https://www.gstatic.com/_/mss/boq-identity/_/js/k=boq-identity.AccountsSignInUi.en_US.abc/am=x/d=1/rs=AOaEm",
  "https://fonts.gstatic.com/s/inter/foo.woff2",
  "https://lh3.googleusercontent.com/a/ACg8ocJ=s64-p-k-rw-no",
  "https://ci3.googleusercontent.com/meips/ADKq_NbXyz=s0-d-e1-ft#https://example.com/logo.png",
  "https://apis.google.com/js/api.js",
  "https://play.google.com/store",
  "https://google.com/",
  // Downloads.
  "https://mail.google.com/mail/u/0/?ui=2&ik=abc&attid=0.1&permmsgid=msg-f:123&th=abc&view=att&disp=safe",
  "https://mail-attachment.googleusercontent.com/attachment/u/0/?ui=2&ik=abc&attid=0.1&permmsgid=msg-f:123&th=abc&view=att&disp=safe&realattid=f_abc&zw",
  "https://drive.usercontent.google.com/download?id=1AbCdEfGhIjKlMnOpQrStUv&export=download",
  // The other apps.
  "https://calendar.google.com/calendar/u/0/r",
  "https://drive.google.com/drive/u/0/my-drive",
  "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit",
  "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit",
  "https://meet.google.com/abc-defg-hij",
];

describe(createBlockMatcher, () => {
  it("blocks Google's ad hosts and their subdomains with ads on", () => {
    expect(blocked({ ads: true, trackers: false }, ADS)).toStrictEqual(ADS);
  });

  it("blocks Google's trackers and telemetry with trackers on", () => {
    expect(
      blocked({ ads: false, trackers: true }, GOOGLE_TRACKERS)
    ).toStrictEqual(GOOGLE_TRACKERS);
  });

  it("blocks email open-tracking pixels, proxied ones by the URL in the fragment, with trackers on", () => {
    expect(blocked({ ads: false, trackers: true }, PIXELS)).toStrictEqual(
      PIXELS
    );
  });

  it("keeps the two switches independent", () => {
    expect([
      blocked({ ads: true, trackers: false }, [...GOOGLE_TRACKERS, ...PIXELS]),
      blocked({ ads: false, trackers: true }, ADS),
    ]).toStrictEqual([[], []]);
  });

  it("is nothing at all when both are off, so a session needs no hook", () => {
    expect(
      createBlockMatcher({ ads: false, trackers: false }, SIGN_IN_ORIGINS)
    ).toBeUndefined();
  });

  it("never blocks what Meru and its apps need, under any resource type", () => {
    expect(
      ["image", "script", "xhr", "subFrame", "other"].flatMap((type) =>
        blocked(BOTH, PROTECTED, type)
      )
    ).toStrictEqual([]);
  });

  it("never blocks a page the person goes to or a download they start", () => {
    expect(
      blocked(BOTH, [...ADS, ...GOOGLE_TRACKERS, ...PIXELS], "mainFrame")
    ).toStrictEqual([]);
  });

  it("protects the sign-in origin itself, not a host that only starts like it", () => {
    expect(
      blocked(BOTH, [
        "https://accounts.google.com.example/gen_204",
        "https://accounts.google.community/gen_204",
      ])
    ).toHaveLength(2);
  });

  it("matches no look-alike host or a blocked host named in a path or query", () => {
    expect(
      blocked(BOTH, [
        "https://evildoubleclick.net/x",
        "https://notgoogle-analytics.com/x",
        "https://example.com/a.doubleclick.net/b",
        "https://example.com/redirect?url=doubleclick.net",
      ])
    ).toStrictEqual([]);
  });

  it("blocks a host written with its trailing dot, and nothing that does not parse", () => {
    expect([
      blocked(BOTH, ["https://ad.doubleclick.net./pagead/x"]),
      blocked(BOTH, ["not a url gen_204", "https://[doubleclick.net/"]),
    ]).toStrictEqual([["https://ad.doubleclick.net./pagead/x"], []]);
  });

  it("matches the list's text in the first 512 characters of host, path and query, and not past them", () => {
    // "example.com/" is 12 characters, "generate_204" 12 more.
    expect(
      blocked(BOTH, [
        `https://example.com/${"x".repeat(488)}generate_204`,
        `https://example.com/${"x".repeat(500)}generate_204`,
      ])
    ).toStrictEqual([`https://example.com/${"x".repeat(488)}generate_204`]);
  });

  it("classifies a 100,000-character URL, and one carried in a fragment that long, in a few milliseconds", () => {
    const matcher = createBlockMatcher(BOTH, SIGN_IN_ORIGINS);
    // Long runs of what the patterns' unbounded parts take, where a match
    // tried at each position would rescan the rest of the string.
    const filler = "a.".repeat(50_000);
    const urls = [
      `https://email.example.com/${filler}`,
      `https://ci3.googleusercontent.com/meips/x#https://email.example.com/${filler}`,
      `https://example.com/?q=${"/o/".repeat(33_000)}`,
      // A host of many labels, as such and carried in the fragment.
      `https://${"a.".repeat(50_000)}doubleclick.net/x`,
      `https://ci3.googleusercontent.com/meips/x#https://${"a.".repeat(50_000)}doubleclick.net/x`,
    ];

    for (const url of urls) {
      const start = performance.now();

      matcher?.({ url, resourceType: "image" });

      expect(performance.now() - start).toBeLessThan(50);
    }
  });
});
