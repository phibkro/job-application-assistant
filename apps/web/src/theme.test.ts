import { describe, expect, it } from "vitest";
import {
  baseColors,
  chartColors,
  colorModes,
  decodeThemePreference,
  defaultThemePreference,
  parseThemePreference,
  presetPreference,
  serializeThemePreference,
  themeColors,
  themePresets,
} from "./theme.ts";

/**
 * The appearance preference is a local, untrusted-input boundary (anything
 * in localStorage can be stale, hand-edited, or from another build), so the
 * contract under test here is exactly that: defaults are Pine + system,
 * serialization round-trips, and malformed or partially-valid storage never
 * throws — every field falls back independently.
 */
describe("theme preference", () => {
  it("defaults to the Pine preset and system appearance", () => {
    expect(defaultThemePreference).toEqual({
      version: 1,
      baseColor: "olive",
      themeColor: "emerald",
      chartColor: "indigo",
      mode: "system",
    });
    expect(themePresets[0]?.id).toBe("pine");
  });

  it("round-trips serializable preferences and safely handles malformed JSON", () => {
    const preference = presetPreference("fjord", "light");
    expect(parseThemePreference(serializeThemePreference(preference))).toEqual(preference);
    expect(parseThemePreference("{broken")).toEqual(defaultThemePreference);
    expect(parseThemePreference(null)).toEqual(defaultThemePreference);
  });

  it("falls back per field so a partially-valid blob keeps what still fits", () => {
    const decoded = decodeThemePreference({
      version: 1,
      baseColor: "mist",
      themeColor: "chartreuse",
      mode: "dark",
    });
    expect(decoded.baseColor).toBe("mist");
    expect(decoded.themeColor).toBe(defaultThemePreference.themeColor);
    expect(decoded.mode).toBe("dark");
  });

  it("rejects non-objects without throwing", () => {
    expect(decodeThemePreference(42)).toEqual(defaultThemePreference);
    expect(decodeThemePreference(null)).toEqual(defaultThemePreference);
    expect(decodeThemePreference("x")).toEqual(defaultThemePreference);
  });

  it("keeps the four dimensions independent of the preset names", () => {
    expect(baseColors).toContain("olive");
    expect(themeColors).toContain("emerald");
    expect(chartColors).toContain("indigo");
    expect(colorModes).toEqual(["system", "light", "dark"]);
    for (const preset of themePresets) {
      expect(baseColors).toContain(preset.baseColor);
      expect(themeColors).toContain(preset.themeColor);
      expect(chartColors).toContain(preset.chartColor);
    }
  });
});
