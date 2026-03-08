import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import fontCatalog from "../src/data/fonts.json";
import type {
  PreviewFontAsset,
  PreviewFontCatalog,
  PreviewFontFormat,
} from "../src/lib/preview-font-catalog";

interface RobloxFontFace {
  assetId?: string;
  name?: string;
  style?: string;
  weight?: number;
}

interface RobloxFontFamily {
  name?: string;
  faces?: RobloxFontFace[];
}

const LOCAL_APP_DATA = process.env.LOCALAPPDATA;
const ROBLOX_VERSIONS_DIR = LOCAL_APP_DATA
  ? path.join(LOCAL_APP_DATA, "Roblox", "Versions")
  : null;
const OUTPUT_FONT_DIR = path.resolve("public", "roblox-fonts");
const OUTPUT_CSS_PATH = path.resolve("src", "generated", "preview-fonts.css");
const OUTPUT_JSON_PATH = path.resolve("src", "data", "preview-fonts.json");

async function main(): Promise<void> {
  const robloxFontsRoot = await findLatestRobloxFontsRoot();
  if (!robloxFontsRoot) {
    await handleMissingRobloxInstall();
    return;
  }

  const familyMap = await readRobloxFamilies(robloxFontsRoot);
  const previewFonts = buildPreviewFonts(robloxFontsRoot, familyMap);

  await rm(OUTPUT_FONT_DIR, { force: true, recursive: true });
  await mkdir(OUTPUT_FONT_DIR, { recursive: true });
  await mkdir(path.dirname(OUTPUT_CSS_PATH), { recursive: true });
  await mkdir(path.dirname(OUTPUT_JSON_PATH), { recursive: true });

  for (const font of previewFonts) {
    const sourcePath = path.join(robloxFontsRoot, font.sourceRelativePath);
    const targetPath = path.join(OUTPUT_FONT_DIR, font.outputFileName);
    await cp(sourcePath, targetPath);
  }

  const previewCatalog: PreviewFontCatalog = {
    generatedAt: new Date().toISOString(),
    sourceUrl: fontCatalog.sourceUrl,
    robloxVersion: robloxFontsRoot,
    fonts: previewFonts.map(({ sourceRelativePath, outputFileName, ...font }) => font),
  };

  await writeFile(OUTPUT_JSON_PATH, `${JSON.stringify(previewCatalog, null, 2)}\n`, "utf8");
  await writeFile(OUTPUT_CSS_PATH, buildPreviewFontCss(previewCatalog.fonts), "utf8");

  console.log(
    `Synced ${previewCatalog.fonts.length} preview fonts from ${robloxFontsRoot} into ${OUTPUT_FONT_DIR}`,
  );
}

async function findLatestRobloxFontsRoot(): Promise<string | null> {
  if (!ROBLOX_VERSIONS_DIR) {
    return null;
  }

  try {
    const versionEntries = await readdir(ROBLOX_VERSIONS_DIR, { withFileTypes: true });
    const candidates = await Promise.all(
      versionEntries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const fontsRoot = path.join(
            ROBLOX_VERSIONS_DIR,
            entry.name,
            "content",
            "fonts",
          );

          try {
            const fontsStat = await stat(path.join(fontsRoot, "families"));
            if (!fontsStat.isDirectory()) {
              return null;
            }

            const rootStat = await stat(fontsRoot);
            return {
              fontsRoot,
              modifiedAtMs: rootStat.mtimeMs,
            };
          } catch {
            return null;
          }
        }),
    );

    const latest = candidates
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
      .sort((left, right) => right.modifiedAtMs - left.modifiedAtMs)[0];

    return latest?.fontsRoot ?? null;
  } catch {
    return null;
  }
}

async function handleMissingRobloxInstall(): Promise<void> {
  const existingOutputs = await Promise.all([
    fileExists(OUTPUT_CSS_PATH),
    fileExists(OUTPUT_JSON_PATH),
  ]);

  if (existingOutputs.every(Boolean)) {
    console.warn(
      "Roblox font files were not found locally. Keeping the existing preview font bundle.",
    );
    return;
  }

  throw new Error(
    "Roblox font files were not found locally and no generated preview font bundle exists.",
  );
}

async function readRobloxFamilies(
  robloxFontsRoot: string,
): Promise<Map<string, RobloxFontFamily>> {
  const familiesDir = path.join(robloxFontsRoot, "families");
  const entries = await readdir(familiesDir, { withFileTypes: true });
  const familyMap = new Map<string, RobloxFontFamily>();

  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name) !== ".json") {
      continue;
    }

    const familyPath = path.join(familiesDir, entry.name);
    const family = JSON.parse(
      await readFile(familyPath, "utf8"),
    ) as RobloxFontFamily;

    const familyName = family.name?.trim();
    if (familyName) {
      familyMap.set(familyName, family);
    }
  }

  return familyMap;
}

function buildPreviewFonts(
  robloxFontsRoot: string,
  familyMap: Map<string, RobloxFontFamily>,
): Array<PreviewFontAsset & { outputFileName: string; sourceRelativePath: string }> {
  return fontCatalog.fonts.map((fontName) => {
    const family = familyMap.get(fontName);
    if (!family) {
      throw new Error(`Missing Roblox font family metadata for "${fontName}".`);
    }

    const face = pickPreviewFace(fontName, family);
    const sourceRelativePath = path.normalize(face.assetId.slice("rbxasset://fonts/".length));
    const sourcePath = path.join(robloxFontsRoot, sourceRelativePath);
    const outputFileName = path.basename(sourceRelativePath);

    return {
      name: fontName,
      url: `/roblox-fonts/${encodeURIComponent(outputFileName)}`,
      weight: face.weight,
      style: normalizeStyle(face.style),
      format: getFontFormat(outputFileName),
      outputFileName,
      sourceRelativePath,
      sourcePath,
    };
  }).map(({ sourcePath, ...font }) => {
    void sourcePath;
    return font;
  });
}

function pickPreviewFace(fontName: string, family: RobloxFontFamily): Required<RobloxFontFace> {
  const localFaces = (family.faces ?? []).filter(isLocalFace);
  if (localFaces.length === 0) {
    throw new Error(`No local font asset found for "${fontName}".`);
  }

  return (
    localFaces.find((face) => face.weight === 400 && normalizeStyle(face.style) === "normal") ??
    localFaces.find((face) => normalizeStyle(face.style) === "normal") ??
    localFaces[0]
  );
}

function isLocalFace(face: RobloxFontFace): face is Required<RobloxFontFace> {
  return (
    typeof face.assetId === "string" &&
    face.assetId.startsWith("rbxasset://fonts/") &&
    typeof face.weight === "number" &&
    typeof face.style === "string" &&
    typeof face.name === "string"
  );
}

function normalizeStyle(style: string): "italic" | "normal" {
  return style.toLowerCase() === "italic" ? "italic" : "normal";
}

function getFontFormat(fileName: string): PreviewFontFormat {
  const extension = path.extname(fileName).toLowerCase();

  switch (extension) {
    case ".otf":
      return "opentype";
    case ".ttf":
      return "truetype";
    case ".woff":
      return "woff";
    case ".woff2":
      return "woff2";
    default:
      throw new Error(`Unsupported font format: ${fileName}`);
  }
}

function buildPreviewFontCss(fonts: PreviewFontAsset[]): string {
  const rules = fonts.map(
    (font) => `@font-face {
  font-family: "${escapeCssString(font.name)}";
  src: url("${font.url}") format("${font.format}");
  font-weight: ${font.weight};
  font-style: ${font.style};
  font-display: swap;
}`,
  );

  return `${rules.join("\n\n")}\n`;
}

function escapeCssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

await main();
