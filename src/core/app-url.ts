export interface AppFile {
  host: string;
  /** Path segments under the host's directory, each a plain file or folder name. */
  segments: string[];
}

const INDEX = "index.html";

const decode = (segment: string): string | undefined => {
  try {
    return decodeURIComponent(segment);
  } catch {
    // A malformed escape names no file.
  }
};

const isPlainName = (name: string) =>
  name !== "" && name !== "." && name !== ".." && !/[/\\:\0]/u.test(name);

/**
 * The file an app-scheme URL names, or nothing when the URL is for another
 * scheme or host, or would leave the host's directory: through `..`, an encoded
 * separator, a backslash, a drive letter or a malformed escape.
 */
export const resolveAppFile = (
  url: string,
  scheme: string,
  hosts: readonly string[]
): AppFile | undefined => {
  const parsed = URL.parse(url);

  if (
    !parsed ||
    parsed.protocol !== `${scheme}:` ||
    !hosts.includes(parsed.host)
  ) {
    return;
  }

  const raw = parsed.pathname.split("/").slice(1);

  if (raw.length === 0) {
    return { host: parsed.host, segments: [INDEX] };
  }

  const segments: string[] = [];

  for (const [index, segment] of raw.entries()) {
    const isLast = index === raw.length - 1;

    if (segment === "" && isLast) {
      segments.push(INDEX);
      continue;
    }

    const name = decode(segment);

    if (name === undefined || !isPlainName(name)) {
      return;
    }

    segments.push(name);
  }

  return { host: parsed.host, segments };
};

/**
 * Whether two URLs share a scheme and host. `URL.origin` cannot answer it:
 * outside a browser it is `"null"` for every scheme it does not know.
 */
export const isSameSite = (url: string, other: string) => {
  const a = URL.parse(url);
  const b = URL.parse(other);

  return !!a && !!b && a.protocol === b.protocol && a.host === b.host;
};
