const searchParams = new URLSearchParams(window.location.search);

export const darkModeSearchParam = searchParams.get("darkMode");

export const trialDaysLeftSearchParam = searchParams.get("trialDaysLeft");
