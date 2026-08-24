// Adapted from course-data-platform apps/student-web/src/theme.ts
// (AGPL-3.0-only, Copyright (c) 2026 Philip B. Krogh); reused by the
// copyright holder under this repository's proprietary license.
//
// The appearance preference: four validated dimensions (base surface,
// accent colour, chart palette, colour mode), stored locally as versioned
// JSON and applied by setting data-* attributes + the `dark` class on the
// document root. Views never read this module — the DOM attributes are what
// the stylesheet keys off — so a stale preference can only ever change how
// things look, not what they say.
import * as S from "effect/Schema";

export const baseColors = ["olive", "mist", "zinc", "stone", "mauve", "neutral"] as const;
export const themeColors = ["emerald", "blue", "violet", "amber", "rose", "sky"] as const;
export const chartColors = ["indigo", "sky", "violet", "emerald", "rose", "amber"] as const;
export const colorModes = ["system", "light", "dark"] as const;

export type BaseColor = (typeof baseColors)[number];
export type ThemeColor = (typeof themeColors)[number];
export type ChartColor = (typeof chartColors)[number];
export type ColorMode = (typeof colorModes)[number];

export interface ThemePreference {
  readonly version: 1;
  readonly baseColor: BaseColor;
  readonly themeColor: ThemeColor;
  readonly chartColor: ChartColor;
  readonly mode: ColorMode;
}

export type ThemePresetId = "fjord" | "aurora" | "birch" | "heather" | "pine" | "polar-night";

export interface ThemePreset {
  readonly id: ThemePresetId;
  readonly baseColor: BaseColor;
  readonly themeColor: ThemeColor;
  readonly chartColor: ChartColor;
}

/** Pine first: `defaultThemePreference` derives from `themePresets[0]`, so
 *  array order is what makes Pine the default (see WS-0013-r1). */
export const themePresets: ReadonlyArray<ThemePreset> = [
  { id: "pine", baseColor: "olive", themeColor: "emerald", chartColor: "indigo" },
  { id: "fjord", baseColor: "mist", themeColor: "blue", chartColor: "sky" },
  { id: "aurora", baseColor: "zinc", themeColor: "violet", chartColor: "violet" },
  { id: "birch", baseColor: "stone", themeColor: "amber", chartColor: "emerald" },
  { id: "heather", baseColor: "mauve", themeColor: "rose", chartColor: "rose" },
  { id: "polar-night", baseColor: "neutral", themeColor: "sky", chartColor: "amber" },
];

export const defaultThemePreference: ThemePreference = {
  version: 1,
  baseColor: themePresets[0]!.baseColor,
  themeColor: themePresets[0]!.themeColor,
  chartColor: themePresets[0]!.chartColor,
  mode: "system",
};

export const themePreferenceStorageKey = "job-index-theme-v1";

/** The Schema twin of `decodeThemePreference`, for the one place a
 *  preference crosses a Command boundary (`PersistThemePreference`'s args
 *  are Schema fields). Decode logic itself stays hand-rolled below so an
 *  unknown field degrades per-field instead of failing wholesale — the same
 *  leniency the source module ships. */
export const ThemePreferenceSchema = S.Struct({
  version: S.Literal(1),
  baseColor: S.Literals(baseColors),
  themeColor: S.Literals(themeColors),
  chartColor: S.Literals(chartColors),
  mode: S.Literals(colorModes),
});

const includes = <Value extends string>(
  values: ReadonlyArray<Value>,
  value: unknown,
): value is Value => typeof value === "string" && values.includes(value as Value);

/** Per-field validation with per-field fallbacks: a stored blob written by
 *  an older build keeps every field it got right rather than resetting the
 *  whole preference. */
export const decodeThemePreference = (value: unknown): ThemePreference => {
  if (typeof value !== "object" || value === null) return defaultThemePreference;
  const candidate = value as Partial<Record<keyof ThemePreference, unknown>>;
  return {
    version: 1,
    baseColor: includes(baseColors, candidate.baseColor)
      ? candidate.baseColor
      : defaultThemePreference.baseColor,
    themeColor: includes(themeColors, candidate.themeColor)
      ? candidate.themeColor
      : defaultThemePreference.themeColor,
    chartColor: includes(chartColors, candidate.chartColor)
      ? candidate.chartColor
      : defaultThemePreference.chartColor,
    mode: includes(colorModes, candidate.mode) ? candidate.mode : defaultThemePreference.mode,
  };
};

export const parseThemePreference = (value: string | null): ThemePreference => {
  if (value === null) return defaultThemePreference;
  try {
    return decodeThemePreference(JSON.parse(value));
  } catch {
    return defaultThemePreference;
  }
};

export const serializeThemePreference = (preference: ThemePreference): string =>
  JSON.stringify(preference);

export const presetPreference = (presetId: ThemePresetId, mode: ColorMode): ThemePreference => {
  const preset = themePresets.find(({ id }) => id === presetId) ?? themePresets[0]!;
  return {
    version: 1,
    baseColor: preset.baseColor,
    themeColor: preset.themeColor,
    chartColor: preset.chartColor,
    mode,
  };
};

export const selectedPresetId = (preference: ThemePreference): ThemePresetId | null =>
  themePresets.find(
    (preset) =>
      preset.baseColor === preference.baseColor &&
      preset.themeColor === preference.themeColor &&
      preset.chartColor === preference.chartColor,
  )?.id ?? null;

const themeColorByMode: Readonly<Record<ThemeColor, Readonly<{ light: string; dark: string }>>> = {
  blue: { light: "#f7f9ff", dark: "#10131a" },
  violet: { light: "#fbf8ff", dark: "#141119" },
  amber: { light: "#fff9f0", dark: "#17130d" },
  rose: { light: "#fff8fa", dark: "#191114" },
  emerald: { light: "#f7f9f5", dark: "#101411" },
  sky: { light: "#f5faff", dark: "#0e1419" },
};

export const applyThemePreference = (preference: ThemePreference, systemDark = false): void => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isDark = preference.mode === "dark" || (preference.mode === "system" && systemDark);
  root.dataset.baseColor = preference.baseColor;
  root.dataset.themeColor = preference.themeColor;
  root.dataset.chartColor = preference.chartColor;
  root.dataset.colorMode = preference.mode;
  root.classList.toggle("dark", isDark);
  root.style.colorScheme = isDark ? "dark" : "light";
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", themeColorByMode[preference.themeColor][isDark ? "dark" : "light"]);
};

export const readThemePreference = (): ThemePreference => {
  if (typeof window === "undefined") return defaultThemePreference;
  try {
    return parseThemePreference(localStorage.getItem(themePreferenceStorageKey));
  } catch {
    return defaultThemePreference;
  }
};

/** Applies once at boot and then follows the OS while (and only while) the
 *  user is in system mode; an explicit Light/Dark choice must win until the
 *  user changes it again. */
export const initializeThemePreference = (): ThemePreference => {
  const preference = readThemePreference();
  if (typeof window === "undefined") return preference;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  applyThemePreference(preference, media.matches);
  const onChange = (event: MediaQueryListEvent): void => {
    const latest = readThemePreference();
    if (latest.mode === "system") applyThemePreference(latest, event.matches);
  };
  media.addEventListener("change", onChange);
  return preference;
};

export const persistThemePreference = (preference: ThemePreference): void => {
  const validated = decodeThemePreference(preference);
  applyThemePreference(validated, window.matchMedia("(prefers-color-scheme: dark)").matches);
  localStorage.setItem(themePreferenceStorageKey, serializeThemePreference(validated));
};
