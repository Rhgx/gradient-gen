import { JSDOM } from "jsdom";

import type { FontCatalog } from "../../src/lib/font-catalog";

interface NextDataPayload {
  props?: {
    pageProps?: {
      data?: {
        apiReference?: {
          description?: string;
        };
      };
    };
  };
}

export function parseFontNamesFromHtml(html: string): string[] {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const tableFonts = parseFontNamesFromDocumentTables(document);
  if (tableFonts.length > 0) {
    return normalizeFonts(tableFonts);
  }

  const nextDataFonts = parseFontNamesFromNextData(document);
  return normalizeFonts(nextDataFonts);
}

export function buildFontCatalog(
  html: string,
  generatedAt: string,
  sourceUrl: string,
): FontCatalog | null {
  const fonts = parseFontNamesFromHtml(html);
  if (fonts.length === 0) {
    return null;
  }

  return {
    generatedAt,
    sourceUrl,
    fonts,
  };
}

export function normalizeFonts(fontNames: string[]): string[] {
  return Array.from(
    new Set(fontNames.map((fontName) => fontName.trim()).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right));
}

function parseFontNamesFromDocumentTables(document: Document): string[] {
  const tables = Array.from(document.querySelectorAll("table"));

  for (const table of tables) {
    const headers = Array.from(
      table.querySelectorAll("thead th, thead td, tr:first-child th, tr:first-child td"),
    ).map((header) => normalizeHeader(header.textContent ?? ""));

    const hasNameColumn = headers.some((header) => header.includes("name"));
    const hasAssetColumn = headers.some(
      (header) =>
        header.includes("asset id") ||
        header.includes("weights") ||
        header.includes("appearance"),
    );

    if (!hasNameColumn || !hasAssetColumn) {
      continue;
    }

    const rows = Array.from(table.querySelectorAll("tbody tr, tr")).slice(1);
    const fonts = rows
      .map((row) => row.querySelector("td, th")?.textContent?.trim() ?? "")
      .filter(Boolean);

    if (fonts.length > 0) {
      return fonts;
    }
  }

  return [];
}

function parseFontNamesFromNextData(document: Document): string[] {
  const nextData = extractNextData(document);
  const descriptionHtml =
    nextData?.props?.pageProps?.data?.apiReference?.description;

  if (!descriptionHtml) {
    return [];
  }

  const descriptionDom = new JSDOM(`<body>${descriptionHtml}</body>`);
  const rows = Array.from(
    descriptionDom.window.document.querySelectorAll("tr"),
  ).slice(1);

  return rows
    .map((row) => row.querySelector("td, th")?.textContent?.trim() ?? "")
    .filter(Boolean);
}

function extractNextData(document: Document): NextDataPayload | null {
  const element = document.querySelector<HTMLScriptElement>("#__NEXT_DATA__");

  if (!element?.textContent) {
    return null;
  }

  try {
    return JSON.parse(element.textContent) as NextDataPayload;
  } catch {
    return null;
  }
}

function normalizeHeader(headerText: string): string {
  return headerText.replace(/\s+/g, " ").trim().toLowerCase();
}
