/** Whether Settings lets each titlebar button show. */
export interface TitlebarButtonChoices {
  newTab: boolean;
  unifiedInbox: boolean;
  downloads: boolean;
  doNotDisturb: boolean;
}

/**
 * Which of the titlebar's right-hand buttons show. A choice only ever hides:
 * New tab still needs the sidebar hidden and Unified inbox two profiles. Do
 * Not Disturb's moon shows while it holds whatever the choice, so nothing
 * silences notifications with nothing on screen saying so.
 */
export const titlebarButtonsShown = (
  choices: TitlebarButtonChoices,
  {
    sidebarShown,
    profileCount,
    doNotDisturbOn,
  }: { sidebarShown: boolean; profileCount: number; doNotDisturbOn: boolean }
) => ({
  newTab: choices.newTab && !sidebarShown,
  unifiedInbox: choices.unifiedInbox && profileCount >= 2,
  downloads: choices.downloads,
  doNotDisturb: choices.doNotDisturb || doNotDisturbOn,
});
