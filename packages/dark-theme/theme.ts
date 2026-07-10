/*
 * Theme shape and default palette adapted from Dark Reader
 * (https://github.com/darkreader/darkreader), MIT — see ./THIRD_PARTY_NOTICES.md.
 */

export type Theme = {
  mode: 0 | 1;
  brightness: number;
  contrast: number;
  grayscale: number;
  sepia: number;
  backgroundColor: string;
  textColor: string;
};

export const DEFAULT_THEME: Theme = {
  mode: 1,
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  sepia: 0,
  backgroundColor: "#181a1b",
  textColor: "#e8e6e3",
};
