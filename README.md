# Gradient Generator

Static Vite + TypeScript app for generating Roblox RichText gradients with live preview output.

## Development

Requirements:
- Node.js 22+
- Roblox installed locally if you want to regenerate preview font assets

Commands:
- `npm ci`
- `npm run dev`
- `npm test`
- `npm run build`

## Preview Fonts

The app can sync preview font files from a local Roblox install with:

`npm run sync:preview-fonts`

Generated preview assets are stored in:
- `public/roblox-fonts`
- `src/generated/preview-fonts.css`
- `src/data/preview-fonts.json`

If Roblox is not available, the sync script keeps the existing generated bundle.

## License

The source code in this repository is licensed under GNU GPL v3.0 only. See [LICENSE](./LICENSE).

Preview font binaries copied from a local Roblox installation may be subject to separate terms from Roblox and are not relicensed by this repository.
