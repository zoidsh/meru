import { useCallback, useSyncExternalStore } from "react";

const subscribe = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => {
    window.removeEventListener("hashchange", listener);
  };
};

const read = () => decodeURIComponent(location.hash.replace(/^#\/?/u, ""));

/** The page's address after its `#`, kept across a reload, and a way to change it that the history keeps. */
export const useHash = (): readonly [string, (next: string) => void] => {
  const hash = useSyncExternalStore(subscribe, read);
  const navigate = useCallback((next: string) => {
    location.hash = `/${encodeURIComponent(next)}`;
  }, []);
  return [hash, navigate];
};
