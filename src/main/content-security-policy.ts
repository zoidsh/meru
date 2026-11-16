export const serializePolicy = (
  directives: Record<string, readonly string[]>
) =>
  Object.entries(directives)
    .map(([name, sources]) => [name, ...sources].join(" "))
    .join("; ");

export const LOCKED_DOWN = {
  "default-src": ["'none'"],
  "base-uri": ["'none'"],
  "form-action": ["'none'"],
  "frame-ancestors": ["'none'"],
  "object-src": ["'none'"],
} as const;

export const createContentSecurityPolicy = () =>
  serializePolicy({
    ...LOCKED_DOWN,
    "script-src": ["'self'"],
    "style-src": ["'self'"],
    "img-src": ["'self'"],
    "font-src": ["'self'"],
    "connect-src": ["'self'"],
  });
