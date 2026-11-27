const COMPOSE_HASH = "cmid=";

/**
 * Whether a window opened for `url` is one for writing an email: Meru's own
 * for an email link or Contact support (`composeUrl`'s `extsrc=mailto`), or
 * Gmail's compose pop-out, `/mail/u/<n>/popout` with `#cmid%3D<n>`. Gmail's
 * pop-outs of a conversation or an attachment share that path with another
 * hash, so a reply sent from one is never taken for a compose window's send.
 */
export const opensCompose = (url: string) => {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.searchParams.get("extsrc") === "mailto") {
    return true;
  }

  if (!parsed.pathname.endsWith("/popout")) {
    return false;
  }

  // Gmail encodes the hash once; a link that encodes it again still reads.
  let hash = parsed.hash.slice(1);

  for (let round = 0; round < 3; round += 1) {
    if (hash.startsWith(COMPOSE_HASH)) {
      return true;
    }

    try {
      hash = decodeURIComponent(hash);
    } catch {
      return false;
    }
  }

  return false;
};
