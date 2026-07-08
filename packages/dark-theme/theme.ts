/*
 * Theme shape and default palette ported from Dark Reader
 * (https://github.com/darkreader/darkreader), MIT License,
 * Copyright (c) 2018-present Dark Reader Ltd.
 */

export type Theme = {
  mode: 0 | 1;
  brightness: number;
  contrast: number;
  grayscale: number;
  sepia: number;
  darkSchemeBackgroundColor: string;
  darkSchemeTextColor: string;
};

export const DEFAULT_THEME: Theme = {
  mode: 1,
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  sepia: 0,
  darkSchemeBackgroundColor: "#181a1b",
  darkSchemeTextColor: "#e8e6e3",
};
