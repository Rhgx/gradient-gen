export type PreviewFontFormat = "opentype" | "truetype" | "woff" | "woff2";

export interface PreviewFontAsset {
  name: string;
  url: string;
  weight: number;
  style: "italic" | "normal";
  format: PreviewFontFormat;
}

export interface PreviewFontCatalog {
  generatedAt: string;
  sourceUrl: string;
  robloxVersion: string;
  fonts: PreviewFontAsset[];
}
