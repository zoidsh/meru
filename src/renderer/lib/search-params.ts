const searchParams = new URLSearchParams(window.location.search);

export const accountsSearchParam = searchParams.get("accounts");

export const accountsUnreadBadgeSearchParam = searchParams.get(
	"accountsUnreadBadge",
);

export const darkModeSearchParam = searchParams.get("darkMode");

export const licenseKeySearchParam = searchParams.get("licenseKey");
