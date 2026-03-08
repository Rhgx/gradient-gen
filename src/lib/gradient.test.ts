import { describe, expect, it } from "vitest";

import {
  countVisibleCharacters,
  escapeRichText,
  generateGradientColors,
  generateGradientResult,
  normalizeHexColor,
} from "./gradient";

describe("normalizeHexColor", () => {
  it("normalizes shorthand hex values", () => {
    expect(normalizeHexColor("#abc")).toBe("#AABBCC");
  });

  it("rejects invalid colors", () => {
    expect(normalizeHexColor("orange")).toBeNull();
  });
});

describe("generateGradientColors", () => {
  it("returns exact multi-stop colors with valid uppercase hex", () => {
    expect(
      generateGradientColors(["#FF0000", "#00FF00", "#0000FF"], 5),
    ).toEqual(["#FF0000", "#808000", "#00FF00", "#008080", "#0000FF"]);
  });

  it("returns the first color for a single visible character", () => {
    expect(generateGradientColors(["#112233", "#445566"], 1)).toEqual(["#112233"]);
  });
});

describe("generateGradientResult", () => {
  it("keeps whitespace out of the gradient progression", () => {
    const result = generateGradientResult({
      text: "A B",
      colors: ["#FF0000", "#0000FF"],
    });

    expect(result.gradientColors).toEqual(["#FF0000", "#0000FF"]);
    expect(result.previewSegments.map((segment) => segment.color)).toEqual([
      "#FF0000",
      null,
      "#0000FF",
    ]);
    expect(result.richText).toContain(
      '<font color="#FF0000">A</font> <font color="#0000FF">B</font>',
    );
  });

  it("counts punctuation as visible characters", () => {
    expect(countVisibleCharacters("A! ?")).toBe(3);
  });

  it("returns validation errors for duplicate or invalid colors", () => {
    const result = generateGradientResult({
      text: "Test",
      colors: ["#FF0000", "#FF0000", "#12"],
    });

    expect(result.validationErrors.map((error) => error.code)).toEqual([
      "INVALID_COLOR",
      "DUPLICATE_COLORS",
      "TOO_FEW_COLORS",
    ]);
  });

  it("returns empty gradient output when text is only whitespace", () => {
    const result = generateGradientResult({
      text: "   ",
      colors: ["#FF0000", "#00FF00"],
    });

    expect(result.gradientColors).toEqual([]);
    expect(result.richText).toBe("");
  });
});

describe("escapeRichText", () => {
  it("escapes XML-sensitive characters", () => {
    expect(escapeRichText(`<>&'"`)).toBe("&lt;&gt;&amp;&apos;&quot;");
  });
});
