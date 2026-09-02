/**
 * `net::ERR_ABORTED`, which is not a failure: it is the page cancelling a load
 * it started itself.
 */
const ERR_ABORTED = -3;

/**
 * Whether a `did-fail-load` says anything about why a view is empty.
 *
 * Gmail aborts its own subframes on every launch — the `mail/u/0/data?token=`
 * poll, Drive's `auth_warmup`, the `accounts.google.com/ServiceLogin` frame —
 * so a subframe carrying `ERR_ABORTED` is noise. Every other code, and every
 * main frame whatever the code, still says something: a main frame that aborts
 * is the view the user is looking at going blank.
 */
export function isLoadFailureWorthLogging(errorCode: number, isMainFrame: boolean) {
  return isMainFrame || errorCode !== ERR_ABORTED;
}
