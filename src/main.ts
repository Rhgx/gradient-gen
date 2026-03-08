import Sortable from "sortablejs";

import fontCatalog from "./data/fonts.json";
import previewFontCatalog from "./data/preview-fonts.json";
import {
  countVisibleCharacters,
  generateGradientResult,
  normalizeHexColor,
} from "./lib/gradient";
import "./generated/preview-fonts.css";
import "./styles.css";

const defaultColors = ["#4A90E2", "#7EB8FF", "#F3953D"];
const previewFontsByName = new Map(
  previewFontCatalog.fonts.map((font) => [font.name, font]),
);

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found.");
}

app.innerHTML = `
  <header class="glossy-header">
    <div class="header-content">
      <div class="header-title-group">
        <div class="header-title">
          <h1>Gradient Generator</h1>
        </div>
        <p class="header-subtitle">Roblox RichText Gradient Engine</p>
      </div>
    </div>
  </header>

  <main class="workspace">
    <section class="card">
      <div class="card-tab">
        <h2>Compose</h2>
      </div>
      <div class="card-body">
        <label class="field">
          <span class="field__label">Text to convert</span>
          <textarea
            id="textInput"
            class="gel-input gel-textarea"
            rows="4"
            placeholder="Type the RichText content here..."
          >ROBLOX RICH TEXT</textarea>
        </label>

        <label class="field">
          <span class="field__label">Font family</span>
          <select id="fontSelect" class="gel-input gel-select"></select>
        </label>

        <div class="section-divider">
          <span>Color Stops</span>
        </div>

        <div id="colorList" class="color-list" aria-live="polite"></div>

        <div class="button-row">
          <button id="addColorButton" class="gel-btn gel-btn--orange" type="button">
            + Add Color
          </button>
          <button id="resetPaletteButton" class="gel-btn gel-btn--silver" type="button">
            Reset Palette
          </button>
        </div>

        <p class="hint-text">
          Drag the grip to reorder. Spaces stay uncolored.
        </p>
      </div>
    </section>

    <section class="card">
      <div class="card-tab">
        <h2>Output</h2>
      </div>
      <div class="card-body">
        <div id="feedback" class="feedback" role="status"></div>

        <div class="output-block">
          <div class="output-block__header">
            <h3>Live Preview</h3>
          </div>
          <div id="previewSurface" class="preview-surface"></div>
        </div>

        <div class="output-block">
          <div class="output-block__header">
            <h3>RichText Output</h3>
            <button id="copyButton" class="gel-btn gel-btn--silver gel-btn--sm" type="button">
              Copy
            </button>
          </div>
          <textarea id="outputArea" class="gel-input gel-output" rows="10" readonly></textarea>
        </div>
      </div>
    </section>
  </main>
`;

const textInput = getElement<HTMLTextAreaElement>("#textInput");
const fontSelect = getElement<HTMLSelectElement>("#fontSelect");
const colorList = getElement<HTMLDivElement>("#colorList");
const feedback = getElement<HTMLDivElement>("#feedback");
const previewSurface = getElement<HTMLDivElement>("#previewSurface");
const outputArea = getElement<HTMLTextAreaElement>("#outputArea");
const addColorButton = getElement<HTMLButtonElement>("#addColorButton");
const resetPaletteButton = getElement<HTMLButtonElement>("#resetPaletteButton");
const copyButton = getElement<HTMLButtonElement>("#copyButton");

renderFontOptions();
resetPalette();

new Sortable(colorList, {
  animation: 160,
  handle: ".color-stop__grip",
  onEnd: () => renderOutput(),
});

textInput.addEventListener("input", () => renderOutput());
fontSelect.addEventListener("change", () => renderOutput());
addColorButton.addEventListener("click", () => {
  addColorStop(nextAccentColor());
  renderOutput();
});
resetPaletteButton.addEventListener("click", () => {
  resetPalette();
  renderOutput();
});
copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(outputArea.value);
  copyButton.textContent = "Copied";
  window.setTimeout(() => {
    copyButton.textContent = "Copy";
  }, 1200);
});

renderOutput();

function renderFontOptions(): void {
  const options = [
    `<option value="">Default</option>`,
    ...fontCatalog.fonts.map(
      (fontName) =>
        `<option value="${escapeHtml(fontName)}">${escapeHtml(fontName)}</option>`,
    ),
  ];
  fontSelect.innerHTML = options.join("");
}

function addColorStop(value: string): void {
  const normalizedColor = normalizeHexColor(value) ?? defaultColors[0];
  const colorStop = document.createElement("div");
  colorStop.className = "color-stop";
  colorStop.innerHTML = `
    <button class="color-stop__grip" type="button" aria-label="Drag to reorder">::</button>
    <input class="color-stop__picker" type="color" value="${normalizedColor}" />
    <input class="gel-input color-stop__hex" type="text" value="${normalizedColor}" maxlength="7" spellcheck="false" />
    <button class="gel-btn gel-btn--danger gel-btn--sm color-stop__remove" type="button">✕</button>
  `;

  const colorPicker =
    colorStop.querySelector<HTMLInputElement>(".color-stop__picker");
  const colorHex = colorStop.querySelector<HTMLInputElement>(".color-stop__hex");
  const removeButton =
    colorStop.querySelector<HTMLButtonElement>(".color-stop__remove");

  if (!colorPicker || !colorHex || !removeButton) {
    throw new Error("Color stop controls failed to render.");
  }

  colorPicker.addEventListener("input", () => {
    colorHex.value = colorPicker.value.toUpperCase();
    colorHex.dataset.invalid = "false";
    renderOutput();
  });

  colorHex.addEventListener("input", () => {
    const normalized = normalizeHexColor(colorHex.value);
    if (normalized) {
      colorHex.value = normalized;
      colorPicker.value = normalized;
      colorHex.dataset.invalid = "false";
    } else {
      colorHex.dataset.invalid = "true";
    }
    renderOutput();
  });

  removeButton.addEventListener("click", () => {
    colorStop.remove();
    renderOutput();
  });

  colorList.appendChild(colorStop);
}

function resetPalette(): void {
  colorList.innerHTML = "";
  for (const color of defaultColors) {
    addColorStop(color);
  }
}

function renderOutput(): void {
  const colors = Array.from(
    colorList.querySelectorAll<HTMLInputElement>(".color-stop__hex"),
  ).map((input) => input.value);
  const selectedFontName = fontSelect.value || undefined;

  const result = generateGradientResult({
    text: textInput.value,
    colors,
    fontName: selectedFontName,
  });

  const visibleCharacters = countVisibleCharacters(textInput.value);
  outputArea.value = result.richText;
  applyPreviewFont(selectedFontName);

  previewSurface.innerHTML = "";

  if (textInput.value.length === 0) {
    previewSurface.innerHTML =
      '<p class="placeholder">Type something above to see the gradient render.</p>';
  } else if (visibleCharacters === 0) {
    previewSurface.innerHTML =
      '<p class="placeholder">Only whitespace detected. Add visible characters to generate color steps.</p>';
  } else {
    for (const segment of result.previewSegments) {
      const span = document.createElement("span");
      span.textContent = segment.char;
      span.className = segment.isWhitespace
        ? "preview-char preview-char--space"
        : "preview-char";
      if (segment.color) {
        span.style.color = segment.color;
      }
      previewSurface.appendChild(span);
    }
  }

  const messages = [...result.validationErrors.map((error) => error.message)];
  if (messages.length === 0 && visibleCharacters > 0) {
    messages.push("Preview and export are now driven by the same typed generator.");
  }

  feedback.innerHTML = messages
    .map((message) => `<p>${escapeHtml(message)}</p>`)
    .join("");
  feedback.dataset.state = result.validationErrors.length > 0 ? "error" : "ready";
}

function applyPreviewFont(fontName?: string): void {
  if (!fontName) {
    previewSurface.style.removeProperty("font-family");
    previewSurface.style.removeProperty("font-weight");
    previewSurface.style.removeProperty("font-style");
    return;
  }

  const previewFont = previewFontsByName.get(fontName);
  if (!previewFont) {
    previewSurface.style.fontFamily = `"${fontName}", "Fredoka", "Trebuchet MS", sans-serif`;
    previewSurface.style.fontWeight = "400";
    previewSurface.style.fontStyle = "normal";
    return;
  }

  previewSurface.style.fontFamily = `"${previewFont.name}", "Fredoka", "Trebuchet MS", sans-serif`;
  previewSurface.style.fontWeight = String(previewFont.weight);
  previewSurface.style.fontStyle = previewFont.style;
}

function nextAccentColor(): string {
  const palette = ["#91C8FF", "#F5B34E", "#9BCB6A", "#8A8CE6", "#E86A8A"];
  return palette[colorList.children.length % palette.length];
}

function getElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
