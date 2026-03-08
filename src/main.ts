import Sortable from "sortablejs";

import fontCatalog from "./data/fonts.json";
import previewFontCatalog from "./data/preview-fonts.json";
import {
  countVisibleCharacters,
  generateGradientResult,
  normalizeHexColor,
} from "./lib/gradient";
import "./styles.css";

const defaultColors = ["#4A90E2", "#7EB8FF", "#F3953D"];
const defaultPreviewFontName = "Source Sans Pro";
const minColorLimit = 2;
const maxColorLimit = 100;
const defaultColorLimit = 8;
const sliderSoundThrottleMs = 70;
const sliderMinPlaybackRate = 0.78;
const sliderMaxPlaybackRate = 1.18;
const previewFontsByName = new Map(
  previewFontCatalog.fonts.map((font) => [font.name, font]),
);
const previewFontLoadPromises = new Map<string, Promise<FontFace | null>>();

type UiSoundName = "button" | "toggle" | "slider" | "confirm";

interface UiSoundDefinition {
  poolSize: number;
  src: string;
  volume: number;
  playbackRates: number[];
}

interface UiSoundPool {
  index: number;
  instances: HTMLAudioElement[];
}

interface UiSoundPlayOptions {
  playbackRate?: number;
}

const uiSoundDefinitions: Record<UiSoundName, UiSoundDefinition> = {
  button: {
    src: resolvePublicAssetUrl("sfx/button-click-soft.wav"),
    volume: 0.16,
    poolSize: 3,
    playbackRates: [1, 0.9, 1.08],
  },
  toggle: {
    src: resolvePublicAssetUrl("sfx/toggle-switch.wav"),
    volume: 0.2,
    poolSize: 3,
    playbackRates: [1.04, 0.82, 0.92],
  },
  slider: {
    src: resolvePublicAssetUrl("sfx/slider-tick.wav"),
    volume: 0.12,
    poolSize: 4,
    playbackRates: [1],
  },
  confirm: {
    src: resolvePublicAssetUrl("sfx/button-click-soft.wav"),
    volume: 0.18,
    poolSize: 2,
    playbackRates: [1.14, 0.92],
  },
};

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

        <div class="section-divider">
          <span>Gradient Steps</span>
        </div>

        <div id="colorLimitControl" class="gloss-control" data-enabled="false">
          <div class="gloss-control__header">
            <label class="gloss-toggle" for="colorLimitToggle">
              <input
                id="colorLimitToggle"
                class="gloss-toggle__input"
                type="checkbox"
              />
              <span class="gloss-toggle__switch" aria-hidden="true"></span>
              <span class="gloss-toggle__copy">
                <strong>Limit generated colors</strong>
                <small>Step the blend into a fixed palette for banded output.</small>
              </span>
            </label>
          </div>

          <div class="gloss-control__body">
            <label class="gloss-number" for="colorLimitInput">
              <input
                id="colorLimitInput"
                class="gel-input gloss-number__input"
                type="number"
                min="${minColorLimit}"
                max="${maxColorLimit}"
                step="1"
                value="${defaultColorLimit}"
                inputmode="numeric"
                aria-label="Color limit"
                disabled
              />
            </label>

            <div class="gloss-range">
              <input
                id="colorLimitSlider"
                class="gloss-slider"
                type="range"
                min="${minColorLimit}"
                max="${maxColorLimit}"
                step="1"
                value="${defaultColorLimit}"
                aria-label="Color limit slider"
                disabled
              />
              <div class="gloss-range__legend" aria-hidden="true">
                <span>${minColorLimit}</span>
                <span id="colorLimitMaxLabel">${maxColorLimit}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="card card--output">
      <div class="card-tab">
        <h2>Output</h2>
      </div>
      <div class="card-body card-body--output">
        <div id="feedback" class="feedback" role="status"></div>

        <div class="output-block">
          <div class="output-block__header">
            <h3>Live Preview</h3>
          </div>
          <div id="previewSurface" class="preview-surface"></div>
        </div>

        <div class="output-block">
          <div class="output-block__header">
            <h3>Output</h3>
            <button id="copyButton" class="gel-btn gel-btn--silver gel-btn--sm" type="button">
              Copy
            </button>
          </div>
          <textarea id="outputArea" class="gel-input gel-output" readonly></textarea>
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
const colorLimitControl = getElement<HTMLDivElement>("#colorLimitControl");
const colorLimitToggle = getElement<HTMLInputElement>("#colorLimitToggle");
const colorLimitInput = getElement<HTMLInputElement>("#colorLimitInput");
const colorLimitSlider = getElement<HTMLInputElement>("#colorLimitSlider");
const colorLimitMaxLabel = getElement<HTMLSpanElement>("#colorLimitMaxLabel");
const uiSoundPools = createUiSoundPools();
const uiSoundPlaybackIndexes = createUiSoundPlaybackIndexes();
let lastSliderSoundAt = 0;
let lastSliderSoundValue = Number.parseInt(colorLimitSlider.value, 10);

renderFontOptions();
warmPreviewFont(defaultPreviewFontName);
initializeUiSounds();
resetPalette();
syncColorLimitValue(defaultColorLimit);
updateColorLimitState();

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
colorLimitToggle.addEventListener("change", () => {
  playUiSound("toggle", {
    playbackRate: colorLimitToggle.checked ? 1.08 : 0.76,
  });
  updateColorLimitState();
  renderOutput();
});
colorLimitSlider.addEventListener("input", () => {
  maybePlaySliderSound();
  syncColorLimitValue(Number.parseInt(colorLimitSlider.value, 10));
  renderOutput();
});
colorLimitInput.addEventListener("input", () => {
  const nextValue = parseColorLimit(colorLimitInput.value);

  if (nextValue === null) {
    colorLimitInput.dataset.invalid = "true";
    renderOutput();
    return;
  }

  colorLimitInput.dataset.invalid = "false";
  syncColorLimitValue(nextValue);
  renderOutput();
});
colorLimitInput.addEventListener("blur", () => {
  if (parseColorLimit(colorLimitInput.value) !== null) {
    return;
  }

  colorLimitInput.dataset.invalid = "false";
  syncColorLimitValue(Number.parseInt(colorLimitSlider.value, 10));
});
copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(outputArea.value);
  playUiSound("confirm");
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

function initializeUiSounds(): void {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest("button");
    if (!button || button.matches(".color-stop__grip, #copyButton")) {
      return;
    }

    playUiSound("button");
  });
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
  const visibleCharacters = countVisibleCharacters(textInput.value);
  updateColorLimitBounds(visibleCharacters);
  const colorLimit = getSelectedColorLimit();

  const result = generateGradientResult({
    text: textInput.value,
    colors,
    fontName: selectedFontName,
    colorLimit,
  });

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
  if (messages.length === 0) {
    messages.push("Preview and export are now driven by the same typed generator.");
  }

  feedback.innerHTML = messages
    .map((message) => `<p>${escapeHtml(message)}</p>`)
    .join("");
  feedback.dataset.state = result.validationErrors.length > 0 ? "error" : "ready";
}

function getSelectedColorLimit(): number | undefined {
  if (!colorLimitToggle.checked) {
    return undefined;
  }

  return parseColorLimit(colorLimitInput.value) ?? undefined;
}

function parseColorLimit(value: string): number | null {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed)) {
    return null;
  }

  return clampColorLimit(parsed);
}

function clampColorLimit(value: number): number {
  return Math.min(getCurrentMaxColorLimit(), Math.max(minColorLimit, value));
}

function syncColorLimitValue(value: number): void {
  const normalizedValue = clampColorLimit(value);
  const nextValue = String(normalizedValue);

  colorLimitInput.value = nextValue;
  colorLimitSlider.value = nextValue;
  updateSliderProgress();
}

function updateColorLimitState(): void {
  const enabled = colorLimitToggle.checked;
  colorLimitControl.dataset.enabled = String(enabled);
  colorLimitInput.disabled = !enabled;
  colorLimitSlider.disabled = !enabled;
}

function updateColorLimitBounds(visibleCharacters: number): void {
  const nextMaximum = String(resolveColorLimitMax(visibleCharacters));

  colorLimitInput.max = nextMaximum;
  colorLimitSlider.max = nextMaximum;
  colorLimitMaxLabel.textContent = nextMaximum;

  const clampedValue = clampColorLimit(Number.parseInt(colorLimitSlider.value, 10));
  colorLimitInput.value = String(clampedValue);
  colorLimitSlider.value = String(clampedValue);
  lastSliderSoundValue = clampedValue;
  updateSliderProgress();
}

function updateSliderProgress(): void {
  const minimum = Number.parseInt(colorLimitSlider.min, 10);
  const maximum = Number.parseInt(colorLimitSlider.max, 10);
  const value = Number.parseInt(colorLimitSlider.value, 10);
  const range = maximum - minimum;
  const progress = range <= 0 ? 100 : ((value - minimum) / range) * 100;

  colorLimitSlider.style.setProperty("--range-progress", `${progress}%`);
}

function maybePlaySliderSound(): void {
  const nextValue = Number.parseInt(colorLimitSlider.value, 10);
  const now = performance.now();

  if (nextValue === lastSliderSoundValue) {
    return;
  }

  lastSliderSoundValue = nextValue;
  if (now - lastSliderSoundAt < sliderSoundThrottleMs) {
    return;
  }

  lastSliderSoundAt = now;
  playUiSound("slider", {
    playbackRate: getSliderSoundPlaybackRate(nextValue),
  });
}

function applyPreviewFont(fontName?: string): void {
  const resolvedFontName = fontName || defaultPreviewFontName;
  const previewFont = previewFontsByName.get(resolvedFontName);
  if (!previewFont) {
    previewSurface.style.fontFamily = `"${resolvedFontName}", "Trebuchet MS", sans-serif`;
    previewSurface.style.fontWeight = "400";
    previewSurface.style.fontStyle = "normal";
    return;
  }

  warmPreviewFont(previewFont.name);
  previewSurface.style.fontFamily = `"${previewFont.name}", "Trebuchet MS", sans-serif`;
  previewSurface.style.fontWeight = String(previewFont.weight);
  previewSurface.style.fontStyle = previewFont.style;
}

function warmPreviewFont(fontName?: string): void {
  const resolvedFontName = fontName || defaultPreviewFontName;
  const previewFont = previewFontsByName.get(resolvedFontName);

  if (!previewFont || previewFontLoadPromises.has(previewFont.name)) {
    return;
  }

  const fontFace = new FontFace(
    previewFont.name,
    `url("${resolvePublicAssetUrl(previewFont.url)}")`,
    {
      style: previewFont.style,
      weight: String(previewFont.weight),
    },
  );
  const loadPromise = fontFace
    .load()
    .then((loadedFontFace) => {
      document.fonts.add(loadedFontFace);
      return loadedFontFace;
    })
    .catch(() => null);

  previewFontLoadPromises.set(previewFont.name, loadPromise);
}

function resolvePublicAssetUrl(assetPath: string): string {
  const normalizedAssetPath = assetPath.replace(/^\/+/, "");
  return `${import.meta.env.BASE_URL}${normalizedAssetPath}`;
}

function createUiSoundPools(): Record<UiSoundName, UiSoundPool> {
  return Object.fromEntries(
    Object.entries(uiSoundDefinitions).map(([name, definition]) => {
      const instances = Array.from({ length: definition.poolSize }, () => {
        const audio = new Audio(definition.src);
        audio.preload = "auto";
        audio.volume = definition.volume;
        configureAudioPitchBehavior(audio);
        return audio;
      });

      return [name, { index: 0, instances }];
    }),
  ) as Record<UiSoundName, UiSoundPool>;
}

function createUiSoundPlaybackIndexes(): Record<UiSoundName, number> {
  return Object.fromEntries(
    Object.keys(uiSoundDefinitions).map((name) => [name, 0]),
  ) as Record<UiSoundName, number>;
}

function playUiSound(name: UiSoundName, options: UiSoundPlayOptions = {}): void {
  const pool = uiSoundPools[name];
  const audio = pool.instances[pool.index];
  const definition = uiSoundDefinitions[name];
  pool.index = (pool.index + 1) % pool.instances.length;

  audio.currentTime = 0;
  audio.playbackRate =
    options.playbackRate ?? nextUiSoundPlaybackRate(name, definition.playbackRates);
  void audio.play().catch(() => {
    // Ignore autoplay-related rejections until the user has interacted.
  });
}

function configureAudioPitchBehavior(audio: HTMLAudioElement): void {
  audio.defaultPlaybackRate = 1;

  const pitchAwareAudio = audio as HTMLAudioElement & {
    mozPreservesPitch?: boolean;
    preservesPitch?: boolean;
    webkitPreservesPitch?: boolean;
  };

  if ("preservesPitch" in pitchAwareAudio) {
    pitchAwareAudio.preservesPitch = false;
  }
  if ("mozPreservesPitch" in pitchAwareAudio) {
    pitchAwareAudio.mozPreservesPitch = false;
  }
  if ("webkitPreservesPitch" in pitchAwareAudio) {
    pitchAwareAudio.webkitPreservesPitch = false;
  }
}

function getSliderSoundPlaybackRate(value: number): number {
  const minimum = Number.parseInt(colorLimitSlider.min, 10);
  const maximum = Number.parseInt(colorLimitSlider.max, 10);
  const range = maximum - minimum;
  const normalizedValue = range <= 0 ? 1 : (value - minimum) / range;
  const clampedValue = Math.min(1, Math.max(0, normalizedValue));

  return (
    sliderMinPlaybackRate +
    (sliderMaxPlaybackRate - sliderMinPlaybackRate) * clampedValue
  );
}

function getCurrentMaxColorLimit(): number {
  return Number.parseInt(colorLimitSlider.max, 10);
}

function resolveColorLimitMax(visibleCharacters: number): number {
  return Math.max(
    minColorLimit,
    Math.min(maxColorLimit, visibleCharacters),
  );
}

function nextUiSoundPlaybackRate(
  name: UiSoundName,
  playbackRates: number[],
): number {
  const index = uiSoundPlaybackIndexes[name];
  uiSoundPlaybackIndexes[name] = (index + 1) % playbackRates.length;
  return playbackRates[index];
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
