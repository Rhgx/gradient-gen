import { describe, expect, it } from "vitest";

import { normalizeFonts, parseFontNamesFromHtml } from "./font-scraper";

describe("parseFontNamesFromHtml", () => {
  it("extracts fonts from Next.js payload descriptions", () => {
    const html = `
      <html>
        <body>
          <script id="__NEXT_DATA__" type="application/json">
            {
              "props": {
                "pageProps": {
                  "data": {
                    "apiReference": {
                      "description": "<table><tr><th>Name</th><th>Asset ID / Weights / Appearance</th></tr><tr><td>Gotham</td><td><code>rbxasset://fonts/families/GothamSSm.json</code></td></tr><tr><td>Source Sans Pro</td><td><code>rbxasset://fonts/families/SourceSansPro.json</code></td></tr></table>"
                    }
                  }
                }
              }
            }
          </script>
        </body>
      </html>
    `;

    expect(parseFontNamesFromHtml(html)).toEqual(["Gotham", "Source Sans Pro"]);
  });

  it("returns an empty list when no table exists", () => {
    expect(parseFontNamesFromHtml("<html><body><p>No data</p></body></html>")).toEqual([]);
  });
});

describe("normalizeFonts", () => {
  it("dedupes and sorts font names", () => {
    expect(normalizeFonts([" Gotham ", "Arimo", "Gotham", "Bangers"])).toEqual([
      "Arimo",
      "Bangers",
      "Gotham",
    ]);
  });
});
