/** Above this, a count outside the page is shown as this number and a plus. */
export const MAX_SHOWN_UNREAD = 99;

/**
 * The count shown outside the window: each profile's count as its feed last
 * gave it, where a failed poll keeps the last and signed out or not yet
 * polled is `null`, which counts nothing.
 */
export const totalUnread = (counts: readonly (number | null)[]) =>
  counts.reduce<number>((total, count) => total + (count ?? 0), 0);

/** The first of `profiles`, in their order, with unread mail. */
export const firstWithUnread = <Profile extends { unreadCount: number | null }>(
  profiles: readonly Profile[]
) => profiles.find((profile) => (profile.unreadCount ?? 0) > 0);
