import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { FONT_SOURCE_URL, type FontCatalog } from "../src/lib/font-catalog";
import { buildFontCatalog } from "./lib/font-scraper";

const OUTPUT_PATH = path.resolve("src/data/fonts.json");

async function main(): Promise<void> {
  const previousCatalog = await readExistingCatalog();

  try {
    const html = await fetchPageHtml(FONT_SOURCE_URL);
    const generatedAt = new Date().toISOString();
    const nextCatalog = buildFontCatalog(html, generatedAt, FONT_SOURCE_URL);

    if (!nextCatalog) {
      if (previousCatalog) {
        console.warn(
          "Font scrape returned no entries. Keeping the previous snapshot.",
        );
        return;
      }

      throw new Error("Font scrape returned no entries and no fallback exists.");
    }

    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, `${JSON.stringify(nextCatalog, null, 2)}\n`, "utf8");
    console.log(`Saved ${nextCatalog.fonts.length} fonts to ${OUTPUT_PATH}`);
  } catch (error) {
    if (previousCatalog) {
      console.warn(
        `Font scrape failed. Keeping the previous snapshot. ${toErrorMessage(error)}`,
      );
      return;
    }

    throw error;
  }
}

async function fetchPageHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.text();
}

async function readExistingCatalog(): Promise<FontCatalog | null> {
  try {
    const file = await readFile(OUTPUT_PATH, "utf8");
    return JSON.parse(file) as FontCatalog;
  } catch {
    return null;
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

await main();
