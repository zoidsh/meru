const searchParams = new URLSearchParams(window.location.search);

export const accountsSearchParam = searchParams.get("accounts");

export const darkModeSearchParam = searchParams.get("darkMode");

export const licenseKeySearchParam = searchParams.get("licenseKey");

export const trialDaysLeftSearchParam = searchParams.get("trialDaysLeft");
