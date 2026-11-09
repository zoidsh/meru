const searchParams = new URLSearchParams(window.location.search);

export const accountsSearchParam = searchParams.get("accounts");

export const darkModeSearchParam = searchParams.get("darkMode");

export const tabsSearchParam = searchParams.get("tabs");

export const trialSearchParam = searchParams.get("trial");

export const localeSearchParam = searchParams.get("locale");
