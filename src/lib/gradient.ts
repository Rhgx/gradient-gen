export interface GradientInput {
  text: string;
  colors: string[];
  fontName?: string;
}

export interface ValidationError {
  code:
    | "INVALID_TEXT"
    | "INVALID_COLOR"
    | "DUPLICATE_COLORS"
    | "TOO_FEW_COLORS";
  message: string;
}

export interface PreviewSegment {
  char: string;
  color: string | null;
  isWhitespace: boolean;
}

export interface GradientResult {
  richText: string;
  previewSegments: PreviewSegment[];
  gradientColors: string[];
  validationErrors: ValidationError[];
}

interface RGBColor {
  r: number;
  g: number;
  b: number;
}

const HEX_PATTERN = /^#([A-F0-9]{6})$/;
const ESCAPE_MAP: Record<string, string> = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  "'": "&apos;",
  '"': "&quot;",
};

export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim().replace(/^#?/, "#");
  const shorthandMatch = /^#([A-Fa-f0-9]{3})$/.exec(trimmed);

  if (shorthandMatch) {
    const [r, g, b] = shorthandMatch[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  if (!HEX_PATTERN.test(trimmed.toUpperCase())) {
    return null;
  }

  return trimmed.toUpperCase();
}

export function escapeRichText(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => ESCAPE_MAP[char] ?? char);
}

export function countVisibleCharacters(text: string): number {
  return Array.from(text).filter((char) => !isWhitespace(char)).length;
}

export function generateGradientColors(
  colors: string[],
  totalSteps: number,
): string[] {
  const normalizedColors = colors
    .map((color) => normalizeHexColor(color) ?? "")
    .filter(Boolean);

  if (normalizedColors.length < 2 || totalSteps <= 0) {
    return [];
  }

  if (totalSteps === 1) {
    return [normalizedColors[0]];
  }

  const colorStops = normalizedColors.map(hexToRgb);

  return Array.from({ length: totalSteps }, (_, index) => {
    const progress = index / (totalSteps - 1);
    return interpolateStops(colorStops, progress);
  });
}

export function generateGradientResult(input: GradientInput): GradientResult {
  const validationErrors = validateInput(input);
  const previewChars = Array.from(input.text ?? "");

  if (validationErrors.length > 0) {
    return {
      richText: "",
      previewSegments: previewChars.map((char) => ({
        char,
        color: null,
        isWhitespace: isWhitespace(char),
      })),
      gradientColors: [],
      validationErrors,
    };
  }

  const normalizedColors = input.colors.map(
    (color) => normalizeHexColor(color) as string,
  );
  const visibleCharacterCount = countVisibleCharacters(input.text);

  if (visibleCharacterCount === 0) {
    return {
      richText: "",
      previewSegments: previewChars.map((char) => ({
        char,
        color: null,
        isWhitespace: isWhitespace(char),
      })),
      gradientColors: [],
      validationErrors: [],
    };
  }

  const gradientColors =
    visibleCharacterCount === 1
      ? [normalizedColors[0]]
      : generateGradientColors(normalizedColors, visibleCharacterCount);

  const previewSegments: PreviewSegment[] = [];
  const outputParts: string[] = [];
  let visibleIndex = 0;

  for (const char of previewChars) {
    if (isWhitespace(char)) {
      previewSegments.push({
        char,
        color: null,
        isWhitespace: true,
      });
      outputParts.push(char);
      continue;
    }

    const color = gradientColors[visibleIndex] ?? gradientColors.at(-1) ?? null;
    previewSegments.push({
      char,
      color,
      isWhitespace: false,
    });
    outputParts.push(
      `<font color="${color}">${escapeRichText(char)}</font>`,
    );
    visibleIndex += 1;
  }

  const richText = input.fontName?.trim()
    ? `<font face="${escapeRichText(input.fontName.trim())}">${outputParts.join("")}</font>`
    : outputParts.join("");

  return {
    richText,
    previewSegments,
    gradientColors,
    validationErrors: [],
  };
}

function validateInput(input: GradientInput): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof input.text !== "string") {
    errors.push({
      code: "INVALID_TEXT",
      message: "Text must be a string.",
    });
  }

  const normalizedColors = input.colors.map((color) => normalizeHexColor(color));
  const invalidColorCount = normalizedColors.filter((color) => color === null).length;

  if (invalidColorCount > 0) {
    errors.push({
      code: "INVALID_COLOR",
      message: "Every stop must be a valid hex color.",
    });
  }

  const validColors = normalizedColors.filter(
    (color): color is string => color !== null,
  );
  const uniqueColors = new Set(validColors);

  if (uniqueColors.size !== validColors.length) {
    errors.push({
      code: "DUPLICATE_COLORS",
      message: "Use unique colors so the gradient has distinct stops.",
    });
  }

  if (uniqueColors.size < 2) {
    errors.push({
      code: "TOO_FEW_COLORS",
      message: "Pick at least two unique colors.",
    });
  }

  return errors;
}

function isWhitespace(char: string): boolean {
  return /\s/u.test(char);
}

function hexToRgb(hex: string): RGBColor {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHex(color: RGBColor): string {
  return `#${toHexChannel(color.r)}${toHexChannel(color.g)}${toHexChannel(color.b)}`;
}

function toHexChannel(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
}

function interpolateStops(stops: RGBColor[], progress: number): string {
  if (stops.length === 1) {
    return rgbToHex(stops[0]);
  }

  const scaledProgress = progress * (stops.length - 1);
  const leftIndex = Math.min(Math.floor(scaledProgress), stops.length - 2);
  const rightIndex = leftIndex + 1;
  const blend = scaledProgress - leftIndex;

  const left = stops[leftIndex];
  const right = stops[rightIndex];

  return rgbToHex({
    r: left.r + (right.r - left.r) * blend,
    g: left.g + (right.g - left.g) * blend,
    b: left.b + (right.b - left.b) * blend,
  });
}
