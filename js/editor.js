// js/editor.js - Two-Step Photoshop-Style Manual Crop & Straighten Editor
import { createCanvas, stepDownDownscale } from './loader.js';
import { parseLocalizedNumber, formatLocalizedNumber, getLanguage, t } from './i18n.js';
import { icon } from './icons.js';

export class ManualEditor {
  constructor(options = {}) {
    this.container = options.container;
    this.sourceCanvas = null;
    this.targetW = 300;
    this.targetH = 300;
    this.preset = null;
    this.onApply = options.onApply || (() => {});
    this.onLiveUpdate = options.onLiveUpdate || (() => {});

    // Step state: 1 = Crop Frame, 2 = Straighten & Rotate (on committed crop)
    this.currentStep = 1;

    // Step 1 State (Crop rectangle on sourceCanvas coordinates)
    this.crop = { x: 0, y: 0, w: 100, h: 100 };
    this.autoDetectedCrop = null;

    // Committed crop bitmap for Step 2
    this.croppedCanvas = null;

    // Step 2 State (Transforms applied to croppedCanvas around its center)
    this.rotation = 0; // -90, 0, 90, 180, 270
    this.straightenDeg = 0; // -180..+180 (fine control 0.1°)
    this.step2Zoom = 1.0; // 0.1..16.0 (10% to 1600%)
    this.step2PanX = 0;
    this.step2PanY = 0;
    this.flipH = false;
    this.flipV = false;
    this.allowPadding = false;
    this.bgColor = '#ffffff';
    this.transparent = false;

    // History for Undo / Redo in Step 2
    this.undoStack = [];
    this.redoStack = [];

    // Interaction tracking
    this.isDragging = false;
    this.isResizing = false;
    this.resizeHandle = null;
    this.dragStart = { x: 0, y: 0 };
    this.cropStart = { x: 0, y: 0, w: 0, h: 0 };
    this.panStart = { x: 0, y: 0 };

    // Straighten line tool state
    this.straightenToolActive = false;
    this.straightenLineStart = null;
    this.straightenLineEnd = null;

    // Working & Preview Canvases
    this.editorCanvas = null;
    this.previewCanvas = null;
    this.workingTransformedCanvas = null;

    // rAF Coalescing
    this.rafPending = false;

    this.initDOM();
  }

  initDOM() {
    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'editor-modal-overlay hidden';
    this.overlayEl.innerHTML = `
      <div class="editor-modal-dialog">
        <div class="editor-header">
          <div class="editor-header-top">
            <h3 class="editor-title" data-i18n="editorTitle">Manual Crop & Straighten</h3>
            <button type="button" class="editor-close-btn" id="editorCancelBtn" aria-label="Close" title="Close">&times;</button>
          </div>
          <div class="editor-step-tabs" role="tablist">
            <button type="button" class="editor-step-tab active" id="tabStep1" data-step="1">
              ${icon('crop')} <span data-i18n="step1Crop">1. Crop Frame</span>
            </button>
            <button type="button" class="editor-step-tab" id="tabStep2" data-step="2">
              ${icon('ruler')} <span data-i18n="step2Straighten">2. Straighten & Rotate</span>
            </button>
          </div>
        </div>

        <div class="editor-body">
          <div class="editor-viewport-wrapper">
            <div class="editor-viewport-container">
              <canvas id="editorInteractiveCanvas" class="editor-interactive-canvas"></canvas>
            </div>
            <div class="editor-help-text" id="editorHelpText" data-i18n="cropHint">
              Drag frame to move · Drag corners to resize
            </div>
          </div>

          <div class="editor-sidebar">
            <div class="editor-preview-box">
              <div class="editor-preview-header">
                <label class="editor-label" data-i18n="after">Exact Output Preview</label>
                <div class="editor-dim-text" id="editorDimText">300×300 px</div>
              </div>
              <div class="editor-preview-wrapper">
                <canvas id="editorLivePreviewCanvas" class="editor-live-preview"></canvas>
              </div>
            </div>

            <!-- STEP 1 CONTROLS -->
            <div class="editor-step1-panel" id="step1Controls">
              <button type="button" class="btn btn-primary btn-block" id="btnCommitCrop">
                <span data-i18n="commitCrop">Next: Straighten & Rotate →</span>
              </button>
            </div>

            <!-- STEP 2 CONTROLS -->
            <div class="editor-tools" id="step2Controls">
              <!-- Straighten Slider + Keyboard Input (B1b) -->
              <div class="editor-control-group">
                <div class="editor-control-header">
                  <label for="straightenSlider" data-i18n="straighten">Straighten Slider</label>
                  <div class="editor-input-wrap">
                    <input type="text" id="straightenInput" class="editor-num-input" value="0.0°" inputmode="decimal" aria-label="Straighten Angle">
                    <span id="straightenValText" class="hidden">0.0°</span>
                  </div>
                </div>
                <input type="range" id="straightenSlider" min="-180" max="180" step="0.1" value="0" class="editor-slider" aria-label="Straighten Angle Slider">
              </div>

              <!-- Zoom Slider + Keyboard Input (B1b) -->
              <div class="editor-control-group">
                <div class="editor-control-header">
                  <label for="editorZoomSlider" data-i18n="zoom">Zoom</label>
                  <div class="editor-input-wrap">
                    <input type="text" id="zoomInput" class="editor-num-input" value="100%" inputmode="decimal" aria-label="Zoom Percentage">
                    <span id="zoomValText" class="hidden">100%</span>
                  </div>
                </div>
                <input type="range" id="editorZoomSlider" min="0.1" max="16.0" step="0.05" value="1.0" class="editor-slider" aria-label="Zoom Slider">
              </div>

              <!-- Transforms Buttons -->
              <div class="editor-btn-row">
                <button type="button" class="btn btn-secondary btn-sm" id="btnRotLeft" title="Rotate -90°">
                  ${icon('rotate-ccw')} -90°
                </button>
                <button type="button" class="btn btn-secondary btn-sm" id="btnRotRight" title="Rotate +90°">
                  ${icon('rotate-cw')} +90°
                </button>
                <button type="button" class="btn btn-secondary btn-sm" id="btnFlipH" title="Flip Horizontal">
                  ${icon('flip-horizontal')} Flip H
                </button>
                <button type="button" class="btn btn-secondary btn-sm" id="btnFlipV" title="Flip Vertical">
                  ${icon('flip-vertical')} Flip V
                </button>
              </div>

              <!-- Straighten Line Tool Toggle -->
              <div class="editor-straighten-tool-row">
                <button type="button" class="btn btn-secondary btn-sm btn-block" id="btnStraightenTool">
                  ${icon('ruler')} <span data-i18n="straightenTool">Straighten Line Tool</span>
                </button>
              </div>

              <!-- Step Navigation: Back to Crop -->
              <div class="editor-step-back-row">
                <button type="button" class="btn btn-outline btn-sm btn-block" id="btnBackToStep1">
                  <span data-i18n="backToCrop">← Back to Crop Frame</span>
                </button>
              </div>
            </div>

            <!-- Options -->
            <div class="editor-options-row">
              <label class="editor-checkbox-label">
                <input type="checkbox" id="allowPaddingCheck">
                <span data-i18n="allowPadding">Allow padding outside image</span>
              </label>
            </div>

            <!-- Bottom Actions -->
            <div class="editor-actions-row">
              <button type="button" class="btn btn-outline" id="btnResetAuto" data-i18n="resetCrop">Reset to Auto</button>
              <button type="button" class="btn btn-primary" id="btnApplyEditor" data-i18n="applyChanges">Apply & Close</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlayEl);

    this.editorCanvas = this.overlayEl.querySelector('#editorInteractiveCanvas');
    this.previewCanvas = this.overlayEl.querySelector('#editorLivePreviewCanvas');

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        if (!this.overlayEl.classList.contains('hidden')) {
          this.resizeEditorCanvas();
          this.redraw();
        }
      });
      ro.observe(this.editorCanvas.parentElement);
    }

    this.attachEventListeners();
  }

  attachEventListeners() {
    const el = this.overlayEl;

    // Step Tabs & Navigation
    el.querySelector('#tabStep1').addEventListener('click', () => this.setStep(1));
    el.querySelector('#tabStep2').addEventListener('click', () => this.setStep(2));
    el.querySelector('#btnCommitCrop').addEventListener('click', () => this.setStep(2));
    el.querySelector('#btnBackToStep1').addEventListener('click', () => this.setStep(1));

    // Modal buttons
    el.querySelector('#editorCancelBtn').addEventListener('click', () => this.close());
    el.querySelector('#btnApplyEditor').addEventListener('click', () => this.apply());
    el.querySelector('#btnResetAuto').addEventListener('click', () => this.resetToAuto());

    // Rotation & Flip
    el.querySelector('#btnRotLeft').addEventListener('click', () => {
      if (this.currentStep === 1) this.setStep(2);
      this.pushHistory();
      this.rotation = (this.rotation - 90 + 360) % 360;
      this.requestRender();
    });

    el.querySelector('#btnRotRight').addEventListener('click', () => {
      if (this.currentStep === 1) this.setStep(2);
      this.pushHistory();
      this.rotation = (this.rotation + 90) % 360;
      this.requestRender();
    });

    el.querySelector('#btnFlipH').addEventListener('click', () => {
      if (this.currentStep === 1) this.setStep(2);
      this.pushHistory();
      this.flipH = !this.flipH;
      this.requestRender();
    });

    el.querySelector('#btnFlipV').addEventListener('click', () => {
      if (this.currentStep === 1) this.setStep(2);
      this.pushHistory();
      this.flipV = !this.flipV;
      this.requestRender();
    });

    // Straighten Slider + Number Input Two-way sync (B1b & B3)
    const strSlider = el.querySelector('#straightenSlider');
    const strInput = el.querySelector('#straightenInput');
    const strText = el.querySelector('#straightenValText');

    strSlider.addEventListener('input', (e) => {
      if (this.currentStep === 1) this.setStep(2);
      this.straightenDeg = parseFloat(e.target.value) || 0;
      this.updateStraightenInputDisplay();
      this.requestRender();
    });

    this.bindNumericInput(strInput, {
      getVal: () => this.straightenDeg,
      setVal: (v) => {
        this.pushHistory();
        this.straightenDeg = Math.max(-180, Math.min(180, Math.round(v * 10) / 10));
        strSlider.value = this.straightenDeg;
        this.updateStraightenInputDisplay();
        this.requestRender();
      },
      step: 0.1,
      min: -180,
      max: 180,
      format: (v) => `${v.toFixed(1)}°`
    });

    // Zoom Slider + Number Input Two-way sync (B1b & B3)
    const zoomSlider = el.querySelector('#editorZoomSlider');
    const zoomInput = el.querySelector('#zoomInput');
    const zoomText = el.querySelector('#zoomValText');

    zoomSlider.addEventListener('input', (e) => {
      const z = parseFloat(e.target.value) || 1.0;
      this.step2Zoom = z;
      this.updateZoomInputDisplay();
      this.requestRender();
    });

    this.bindNumericInput(zoomInput, {
      getVal: () => Math.round(this.step2Zoom * 100),
      setVal: (pct) => {
        this.pushHistory();
        const clampedPct = Math.max(10, Math.min(1600, pct));
        this.step2Zoom = clampedPct / 100;
        zoomSlider.value = this.step2Zoom;
        this.updateZoomInputDisplay();
        this.requestRender();
      },
      step: 1,
      min: 10,
      max: 1600,
      format: (v) => `${Math.round(v)}%`
    });

    // Straighten Line Tool Toggle
    const strToolBtn = el.querySelector('#btnStraightenTool');
    strToolBtn.addEventListener('click', () => {
      this.straightenToolActive = !this.straightenToolActive;
      strToolBtn.classList.toggle('btn-primary', this.straightenToolActive);
      strToolBtn.classList.toggle('btn-secondary', !this.straightenToolActive);
      this.redraw();
    });

    // Allow padding checkbox
    const padCheck = el.querySelector('#allowPaddingCheck');
    padCheck.addEventListener('change', (e) => {
      this.allowPadding = e.target.checked;
      if (this.currentStep === 1) this.clampCropToBounds();
      this.requestRender();
    });

    // Keyboard Shortcuts (Ctrl+Z, Ctrl+Shift+Z, Esc, Enter)
    window.addEventListener('keydown', (e) => {
      if (this.overlayEl.classList.contains('hidden')) return;
      if (e.target.tagName === 'INPUT') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
      } else if (e.key === 'Escape') {
        this.close();
      } else if (e.key === 'Enter') {
        this.apply();
      }
    });

    // Pointer Events on Interactive Canvas
    this.editorCanvas.style.touchAction = 'none';
    this.editorCanvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.editorCanvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  bindNumericInput(inputEl, { getVal, setVal, step, min, max, format }) {
    let lastCommittedVal = getVal();

    const commit = () => {
      const parsed = parseLocalizedNumber(inputEl.value);
      if (isNaN(parsed)) {
        inputEl.value = format(lastCommittedVal);
        return;
      }
      const clamped = Math.max(min, Math.min(max, parsed));
      setVal(clamped);
      lastCommittedVal = clamped;
      inputEl.value = format(clamped);
    };

    inputEl.addEventListener('focus', () => {
      inputEl.select();
    });

    inputEl.addEventListener('blur', commit);

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        commit();
        inputEl.blur();
      } else if (e.key === 'Escape') {
        inputEl.value = format(lastCommittedVal);
        inputEl.blur();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        let multiplier = 1;
        if (e.shiftKey) multiplier = 10;
        else if (e.altKey) multiplier = 0.1;

        const current = parseLocalizedNumber(inputEl.value);
        const curVal = isNaN(current) ? getVal() : current;
        const delta = (e.key === 'ArrowUp' ? 1 : -1) * step * multiplier;
        const newVal = Math.max(min, Math.min(max, Math.round((curVal + delta) * 100) / 100));
        setVal(newVal);
        lastCommittedVal = newVal;
        inputEl.value = format(newVal);
      }
    });
  }

  updateStraightenInputDisplay() {
    const formatted = `${this.straightenDeg.toFixed(1)}°`;
    const inp = this.overlayEl.querySelector('#straightenInput');
    if (inp && document.activeElement !== inp) inp.value = formatted;
    const txt = this.overlayEl.querySelector('#straightenValText');
    if (txt) txt.textContent = formatted;
  }

  updateZoomInputDisplay() {
    const formatted = `${Math.round(this.step2Zoom * 100)}%`;
    const inp = this.overlayEl.querySelector('#zoomInput');
    if (inp && document.activeElement !== inp) inp.value = formatted;
    const txt = this.overlayEl.querySelector('#zoomValText');
    if (txt) txt.textContent = formatted;
  }

  setStep(stepNumber) {
    if (stepNumber === 2 && this.currentStep === 1) {
      this.commitCropToBitmap();
    }
    this.currentStep = stepNumber;

    const tab1 = this.overlayEl.querySelector('#tabStep1');
    const tab2 = this.overlayEl.querySelector('#tabStep2');
    const p1 = this.overlayEl.querySelector('#step1Controls');
    const backBtnRow = this.overlayEl.querySelector('.editor-step-back-row');
    const help = this.overlayEl.querySelector('#editorHelpText');

    if (stepNumber === 1) {
      tab1?.classList.add('active');
      tab2?.classList.remove('active');
      if (p1) p1.classList.remove('hidden');
      if (backBtnRow) backBtnRow.classList.add('hidden');
      if (help) help.textContent = t('cropHint');
    } else {
      tab1?.classList.remove('active');
      tab2?.classList.add('active');
      if (p1) p1.classList.add('hidden');
      if (backBtnRow) backBtnRow.classList.remove('hidden');
      if (help) help.textContent = t('straightenHintStep2');
    }

    this.redraw();
  }

  commitCropToBitmap() {
    if (!this.sourceCanvas) return;
    const { x, y, w, h } = this.crop;
    const clampedW = Math.max(1, Math.round(w));
    const clampedH = Math.max(1, Math.round(h));

    const patch = createCanvas(clampedW, clampedH);
    const pCtx = patch.getContext('2d');
    if (!this.transparent) {
      pCtx.fillStyle = this.bgColor;
      pCtx.fillRect(0, 0, clampedW, clampedH);
    }
    pCtx.drawImage(this.sourceCanvas, x, y, clampedW, clampedH, 0, 0, clampedW, clampedH);
    this.croppedCanvas = patch;
  }

  open(sourceCanvas, targetW, targetH, initialCrop = null, preset = null, options = {}) {
    this.sourceCanvas = sourceCanvas;
    this.targetW = targetW;
    this.targetH = targetH;
    this.preset = preset;
    this.bgColor = options.bgColor || '#ffffff';
    this.transparent = options.transparent || false;

    // Reset initial transforms
    this.rotation = options.rotation || 0;
    this.straightenDeg = options.straightenDeg || 0;
    this.step2Zoom = 1.0;
    this.step2PanX = 0;
    this.step2PanY = 0;
    this.flipH = options.flipH || false;
    this.flipV = options.flipV || false;
    this.allowPadding = options.allowPadding || false;
    this.undoStack = [];
    this.redoStack = [];

    this.overlayEl.querySelector('#allowPaddingCheck').checked = this.allowPadding;
    this.overlayEl.querySelector('#straightenSlider').value = this.straightenDeg;
    this.overlayEl.querySelector('#editorZoomSlider').value = 1.0;
    this.updateStraightenInputDisplay();
    this.updateZoomInputDisplay();
    this.overlayEl.querySelector('#editorDimText').textContent = `${targetW}×${targetH} px`;

    if (initialCrop) {
      this.crop = { ...initialCrop };
      this.autoDetectedCrop = { ...initialCrop };
    } else {
      this.resetCropToCenter();
      this.autoDetectedCrop = { ...this.crop };
    }

    this.commitCropToBitmap();
    this.setStep(1);

    this.overlayEl.classList.remove('hidden');
    this.resizeEditorCanvas();
    this.redraw();
  }

  close() {
    this.overlayEl.classList.add('hidden');
  }

  apply() {
    if (this.currentStep === 1) {
      this.commitCropToBitmap();
    }
    this.close();

    // Render final high-quality transformed canvas from croppedCanvas
    const finalRender = this.renderFinalTransformedCrop();

    this.onApply({
      crop: this.crop,
      rotation: this.rotation,
      straightenDeg: this.straightenDeg,
      flipH: this.flipH,
      flipV: this.flipV,
      allowPadding: this.allowPadding,
      transformedCanvas: finalRender,
      croppedCanvas: this.croppedCanvas,
      step2Transform: {
        rotation: this.rotation,
        straightenDeg: this.straightenDeg,
        zoom: this.step2Zoom,
        panX: this.step2PanX,
        panY: this.step2PanY,
        flipH: this.flipH,
        flipV: this.flipV
      }
    });
  }

  resetToAuto() {
    this.rotation = 0;
    this.straightenDeg = 0;
    this.step2Zoom = 1.0;
    this.step2PanX = 0;
    this.step2PanY = 0;
    this.flipH = false;
    this.flipV = false;
    this.overlayEl.querySelector('#straightenSlider').value = 0;
    this.overlayEl.querySelector('#editorZoomSlider').value = 1.0;
    this.updateStraightenInputDisplay();
    this.updateZoomInputDisplay();

    if (this.autoDetectedCrop) {
      this.crop = { ...this.autoDetectedCrop };
    } else {
      this.resetCropToCenter();
    }

    this.commitCropToBitmap();
    this.setStep(1);
  }

  resetCropToCenter() {
    if (!this.sourceCanvas) return;
    const imgW = this.sourceCanvas.width;
    const imgH = this.sourceCanvas.height;
    const targetAspect = this.targetW / this.targetH;

    let cw, ch;
    if (imgW / imgH > targetAspect) {
      ch = imgH * 0.85;
      cw = ch * targetAspect;
    } else {
      cw = imgW * 0.85;
      ch = cw / targetAspect;
    }

    this.crop = {
      x: Math.round((imgW - cw) / 2),
      y: Math.round((imgH - ch) / 2),
      w: Math.round(cw),
      h: Math.round(ch)
    };
    this.clampCropToBounds();
  }

  clampCropToBounds() {
    if (this.allowPadding || !this.sourceCanvas) return;
    const imgW = this.sourceCanvas.width;
    const imgH = this.sourceCanvas.height;

    if (this.crop.w > imgW) {
      const scale = imgW / this.crop.w;
      this.crop.w = imgW;
      this.crop.h = Math.round(this.crop.h * scale);
    }
    if (this.crop.h > imgH) {
      const scale = imgH / this.crop.h;
      this.crop.h = imgH;
      this.crop.w = Math.round(this.crop.w * scale);
    }

    if (this.crop.x < 0) this.crop.x = 0;
    if (this.crop.y < 0) this.crop.y = 0;
    if (this.crop.x + this.crop.w > imgW) this.crop.x = imgW - this.crop.w;
    if (this.crop.y + this.crop.h > imgH) this.crop.y = imgH - this.crop.h;
  }

  pushHistory() {
    this.undoStack.push({
      rotation: this.rotation,
      straightenDeg: this.straightenDeg,
      zoom: this.step2Zoom,
      panX: this.step2PanX,
      panY: this.step2PanY,
      flipH: this.flipH,
      flipV: this.flipV
    });
    if (this.undoStack.length > 30) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    if (this.undoStack.length === 0) return;
    const state = this.undoStack.pop();
    this.redoStack.push({
      rotation: this.rotation,
      straightenDeg: this.straightenDeg,
      zoom: this.step2Zoom,
      panX: this.step2PanX,
      panY: this.step2PanY,
      flipH: this.flipH,
      flipV: this.flipV
    });
    this.applyHistoryState(state);
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const state = this.redoStack.pop();
    this.undoStack.push({
      rotation: this.rotation,
      straightenDeg: this.straightenDeg,
      zoom: this.step2Zoom,
      panX: this.step2PanX,
      panY: this.step2PanY,
      flipH: this.flipH,
      flipV: this.flipV
    });
    this.applyHistoryState(state);
  }

  applyHistoryState(state) {
    this.rotation = state.rotation;
    this.straightenDeg = state.straightenDeg;
    this.step2Zoom = state.zoom;
    this.step2PanX = state.panX;
    this.step2PanY = state.panY;
    this.flipH = state.flipH;
    this.flipV = state.flipV;

    this.overlayEl.querySelector('#straightenSlider').value = this.straightenDeg;
    this.overlayEl.querySelector('#editorZoomSlider').value = this.step2Zoom;
    this.updateStraightenInputDisplay();
    this.updateZoomInputDisplay();
    this.requestRender();
  }

  resizeEditorCanvas() {
    const container = this.editorCanvas.parentElement;
    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.editorCanvas.width = (rect.width || 600) * dpr;
    this.editorCanvas.height = (rect.height || 450) * dpr;
  }

  requestRender() {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.redraw();
    });
  }

  redraw() {
    if (!this.sourceCanvas) return;
    const cvs = this.editorCanvas;
    const ctx = cvs.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = cvs.width / dpr;
    const ch = cvs.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cw, ch);

    if (this.currentStep === 1) {
      this.drawStep1Crop(ctx, cw, ch);
    } else {
      this.drawStep2Straighten(ctx, cw, ch);
    }

    ctx.restore();
    this.renderLivePreview();
  }

  drawStep1Crop(ctx, cw, ch) {
    const imgW = this.sourceCanvas.width;
    const imgH = this.sourceCanvas.height;
    const scale = Math.min((cw - 40) / imgW, (ch - 40) / imgH);
    const offsetX = (cw - imgW * scale) / 2;
    const offsetY = (ch - imgH * scale) / 2;

    this.displayScale = scale;
    this.displayOffsetX = offsetX;
    this.displayOffsetY = offsetY;

    // 1. Draw source image
    ctx.drawImage(this.sourceCanvas, offsetX, offsetY, imgW * scale, imgH * scale);

    // 2. Dark semi-transparent mask outside crop frame
    const cropScreenX = offsetX + this.crop.x * scale;
    const cropScreenY = offsetY + this.crop.y * scale;
    const cropScreenW = this.crop.w * scale;
    const cropScreenH = this.crop.h * scale;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    ctx.rect(cropScreenX, cropScreenY, cropScreenW, cropScreenH);
    ctx.fill('evenodd');

    // 3. Rule of thirds grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cropScreenX + cropScreenW / 3, cropScreenY);
    ctx.lineTo(cropScreenX + cropScreenW / 3, cropScreenY + cropScreenH);
    ctx.moveTo(cropScreenX + (cropScreenW * 2) / 3, cropScreenY);
    ctx.lineTo(cropScreenX + (cropScreenW * 2) / 3, cropScreenY + cropScreenH);
    ctx.moveTo(cropScreenX, cropScreenY + cropScreenH / 3);
    ctx.lineTo(cropScreenX + cropScreenW, cropScreenY + cropScreenH / 3);
    ctx.moveTo(cropScreenX, cropScreenY + (cropScreenH * 2) / 3);
    ctx.lineTo(cropScreenX + cropScreenW, cropScreenY + (cropScreenH * 2) / 3);
    ctx.stroke();

    // 4. Crop frame border
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(cropScreenX, cropScreenY, cropScreenW, cropScreenH);

    // 5. 8 Handles (4 corners + 4 edges) with high-contrast 12px hit targets (B8)
    const handleSize = 12;
    const half = handleSize / 2;
    const handles = [
      { x: cropScreenX, y: cropScreenY }, // TL
      { x: cropScreenX + cropScreenW / 2, y: cropScreenY }, // T
      { x: cropScreenX + cropScreenW, y: cropScreenY }, // TR
      { x: cropScreenX + cropScreenW, y: cropScreenY + cropScreenH / 2 }, // R
      { x: cropScreenX + cropScreenW, y: cropScreenY + cropScreenH }, // BR
      { x: cropScreenX + cropScreenW / 2, y: cropScreenY + cropScreenH }, // B
      { x: cropScreenX, y: cropScreenY + cropScreenH }, // BL
      { x: cropScreenX, y: cropScreenY + cropScreenH / 2 } // L
    ];

    handles.forEach(p => {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 2;
      ctx.fillRect(p.x - half, p.y - half, handleSize, handleSize);
      ctx.strokeRect(p.x - half, p.y - half, handleSize, handleSize);
    });
  }

  drawStep2Straighten(ctx, cw, ch) {
    if (!this.croppedCanvas) this.commitCropToBitmap();
    const bmp = this.croppedCanvas;
    const bmpW = bmp.width;
    const bmpH = bmp.height;

    const baseScale = Math.min((cw - 40) / bmpW, (ch - 40) / bmpH);
    const cx = cw / 2;
    const cy = ch / 2;

    this.displayScale = baseScale;
    this.displayOffsetX = cx;
    this.displayOffsetY = cy;

    // Viewport background
    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, cw, ch);

    // Checkered background pattern for transparency
    this.drawCheckerPattern(ctx, cw, ch);

    ctx.save();
    // Pivot around center of viewport and center of cropped image (B1 & Section 2)
    ctx.translate(cx + this.step2PanX * baseScale, cy + this.step2PanY * baseScale);
    const totalDeg = this.rotation + this.straightenDeg;
    ctx.rotate((totalDeg * Math.PI) / 180);
    ctx.scale(this.step2Zoom * (this.flipH ? -1 : 1), this.step2Zoom * (this.flipV ? -1 : 1));

    // Clear + Fill before draw (B2 Anti-ghosting)
    if (!this.transparent) {
      ctx.fillStyle = this.bgColor;
      ctx.fillRect(-bmpW / 2 * baseScale, -bmpH / 2 * baseScale, bmpW * baseScale, bmpH * baseScale);
    }
    // Single draw of cropped image
    ctx.drawImage(bmp, -bmpW / 2 * baseScale, -bmpH / 2 * baseScale, bmpW * baseScale, bmpH * baseScale);

    ctx.restore();

    // Output boundary target guide box
    const guideW = this.targetW * baseScale;
    const guideH = this.targetH * baseScale;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - guideW / 2, cy - guideH / 2, guideW, guideH);

    // Draw straighten tool active line if in progress
    if (this.straightenToolActive && this.straightenLineStart && this.straightenLineEnd) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.straightenLineStart.x, this.straightenLineStart.y);
      ctx.lineTo(this.straightenLineEnd.x, this.straightenLineEnd.y);
      ctx.stroke();
    }
  }

  drawCheckerPattern(ctx, w, h) {
    const size = 12;
    ctx.fillStyle = '#27272a';
    for (let y = 0; y < h; y += size * 2) {
      for (let x = 0; x < w; x += size * 2) {
        ctx.fillRect(x, y, size, size);
        ctx.fillRect(x + size, y + size, size, size);
      }
    }
  }

  renderLivePreview() {
    if (!this.previewCanvas) return;
    this.previewCanvas.width = this.targetW;
    this.previewCanvas.height = this.targetH;
    const pCtx = this.previewCanvas.getContext('2d');
    pCtx.imageSmoothingEnabled = true;
    pCtx.imageSmoothingQuality = 'medium';

    // Section 2 Rule: Clear + Fill first, one draw, no underlay
    if (!this.transparent) {
      pCtx.fillStyle = this.bgColor;
      pCtx.fillRect(0, 0, this.targetW, this.targetH);
    } else {
      pCtx.clearRect(0, 0, this.targetW, this.targetH);
    }

    if (this.currentStep === 1) {
      const { x, y, w, h } = this.crop;
      pCtx.drawImage(this.sourceCanvas, x, y, w, h, 0, 0, this.targetW, this.targetH);
    } else {
      if (!this.croppedCanvas) this.commitCropToBitmap();
      const bmp = this.croppedCanvas;
      const totalDeg = this.rotation + this.straightenDeg;
      const cx = bmp.width / 2;
      const cy = bmp.height / 2;
      const scale = Math.min(this.targetW / bmp.width, this.targetH / bmp.height) * this.step2Zoom;

      pCtx.save();
      pCtx.translate(this.targetW / 2, this.targetH / 2);
      pCtx.rotate((totalDeg * Math.PI) / 180);
      pCtx.scale(scale * (this.flipH ? -1 : 1), scale * (this.flipV ? -1 : 1));
      pCtx.translate(-cx - this.step2PanX, -cy - this.step2PanY);
      pCtx.drawImage(bmp, 0, 0);
      pCtx.restore();
    }
  }

  renderFinalTransformedCrop() {
    if (!this.croppedCanvas) this.commitCropToBitmap();
    const bmp = this.croppedCanvas;
    const totalDeg = this.rotation + this.straightenDeg;

    const out = createCanvas(this.targetW, this.targetH);
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Section 2 Architecture Rule: Clear + Fill first, one transform, one draw
    if (!this.transparent) {
      ctx.fillStyle = this.bgColor;
      ctx.fillRect(0, 0, this.targetW, this.targetH);
    }

    const cx = bmp.width / 2;
    const cy = bmp.height / 2;
    const scale = Math.min(this.targetW / bmp.width, this.targetH / bmp.height) * this.step2Zoom;

    ctx.save();
    ctx.translate(this.targetW / 2, this.targetH / 2);
    ctx.rotate((totalDeg * Math.PI) / 180);
    ctx.scale(scale * (this.flipH ? -1 : 1), scale * (this.flipV ? -1 : 1));
    ctx.translate(-cx - this.step2PanX, -cy - this.step2PanY);
    ctx.drawImage(bmp, 0, 0); // Exactly one draw
    ctx.restore();

    return out;
  }

  // Pointer interactions
  onPointerDown(e) {
    const rect = this.editorCanvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (this.currentStep === 1) {
      const scale = this.displayScale;
      const cropScreenX = this.displayOffsetX + this.crop.x * scale;
      const cropScreenY = this.displayOffsetY + this.crop.y * scale;
      const cropScreenW = this.crop.w * scale;
      const cropScreenH = this.crop.h * scale;

      // Check 8 Handles with 22px touch-friendly threshold (B8)
      const handleThreshold = 22;
      const handles = [
        { name: 'tl', x: cropScreenX, y: cropScreenY },
        { name: 'tr', x: cropScreenX + cropScreenW, y: cropScreenY },
        { name: 'bl', x: cropScreenX, y: cropScreenY + cropScreenH },
        { name: 'br', x: cropScreenX + cropScreenW, y: cropScreenY + cropScreenH },
        { name: 't', x: cropScreenX + cropScreenW / 2, y: cropScreenY },
        { name: 'b', x: cropScreenX + cropScreenW / 2, y: cropScreenY + cropScreenH },
        { name: 'l', x: cropScreenX, y: cropScreenY + cropScreenH / 2 },
        { name: 'r', x: cropScreenX + cropScreenW, y: cropScreenY + cropScreenH / 2 }
      ];

      for (const h of handles) {
        if (Math.hypot(px - h.x, py - h.y) <= handleThreshold) {
          this.isResizing = true;
          this.resizeHandle = h.name;
          this.dragStart = { x: px, y: py };
          this.cropStart = { ...this.crop };
          this.editorCanvas.setPointerCapture(e.pointerId);
          return;
        }
      }

      // Check inside crop frame to move
      if (px >= cropScreenX && px <= cropScreenX + cropScreenW &&
          py >= cropScreenY && py <= cropScreenY + cropScreenH) {
        this.isDragging = true;
        this.dragStart = { x: px, y: py };
        this.cropStart = { ...this.crop };
        this.editorCanvas.setPointerCapture(e.pointerId);
      }
    } else {
      // Step 2: Straighten Tool line drag or Pan
      if (this.straightenToolActive) {
        this.straightenLineStart = { x: px, y: py };
        this.straightenLineEnd = { x: px, y: py };
        this.editorCanvas.setPointerCapture(e.pointerId);
      } else {
        this.isDragging = true;
        this.dragStart = { x: px, y: py };
        this.panStart = { x: this.step2PanX, y: this.step2PanY };
        this.editorCanvas.setPointerCapture(e.pointerId);
      }
    }
  }

  onPointerMove(e) {
    const rect = this.editorCanvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (this.currentStep === 1) {
      if (!this.isDragging && !this.isResizing) return;
      const dx = (px - this.dragStart.x) / this.displayScale;
      const dy = (py - this.dragStart.y) / this.displayScale;

      if (this.isDragging) {
        this.crop.x = Math.round(this.cropStart.x + dx);
        this.crop.y = Math.round(this.cropStart.y + dy);
        this.clampCropToBounds();
        this.requestRender();
        return;
      }

      if (this.isResizing) {
        const targetAspect = this.targetW / this.targetH;
        let deltaH = 0;
        if (this.resizeHandle.includes('b')) deltaH = dy;
        else if (this.resizeHandle.includes('t')) deltaH = -dy;
        else deltaH = dy;

        let newH = Math.max(20, this.cropStart.h + deltaH);
        let newW = Math.round(newH * targetAspect);

        const cx = this.cropStart.x + this.cropStart.w / 2;
        const cy = this.cropStart.y + this.cropStart.h / 2;

        this.crop.w = newW;
        this.crop.h = newH;
        this.crop.x = Math.round(cx - newW / 2);
        this.crop.y = Math.round(cy - newH / 2);

        this.clampCropToBounds();
        this.requestRender();
      }
    } else {
      // Step 2
      if (this.straightenToolActive && this.straightenLineStart) {
        this.straightenLineEnd = { x: px, y: py };
        this.requestRender();
      } else if (this.isDragging) {
        const dx = (px - this.dragStart.x) / this.displayScale;
        const dy = (py - this.dragStart.y) / this.displayScale;
        this.step2PanX = Math.round(this.panStart.x + dx);
        this.step2PanY = Math.round(this.panStart.y + dy);
        this.requestRender();
      }
    }
  }

  onPointerUp(e) {
    if (this.currentStep === 2 && this.straightenToolActive && this.straightenLineStart && this.straightenLineEnd) {
      const dx = this.straightenLineEnd.x - this.straightenLineStart.x;
      const dy = this.straightenLineEnd.y - this.straightenLineStart.y;
      if (Math.hypot(dx, dy) > 10) {
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        // Normalize angle to nearest horizontal/vertical (0 or 90)
        while (angle > 45) angle -= 90;
        while (angle < -45) angle += 90;
        this.pushHistory();
        this.straightenDeg = Math.max(-180, Math.min(180, Math.round(-angle * 10) / 10));
        this.overlayEl.querySelector('#straightenSlider').value = this.straightenDeg;
        this.updateStraightenInputDisplay();
      }
      this.straightenToolActive = false;
      this.straightenLineStart = null;
      this.straightenLineEnd = null;
      const btn = this.overlayEl.querySelector('#btnStraightenTool');
      if (btn) {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
      }
      this.requestRender();
    }

    this.isDragging = false;
    this.isResizing = false;
    this.resizeHandle = null;
    try {
      this.editorCanvas.releasePointerCapture(e.pointerId);
    } catch (err) {}
  }

  onWheel(e) {
    e.preventDefault();
    if (this.currentStep === 1) {
      // Step 1: Adjust crop frame size around center
      const zoomDelta = e.deltaY < 0 ? 0.05 : -0.05;
      const currentZoom = Math.min(this.sourceCanvas.width / this.crop.w, this.sourceCanvas.height / this.crop.h);
      const newZoom = Math.max(0.2, Math.min(5.0, currentZoom * (1 + zoomDelta)));
      const baseDim = Math.min(this.sourceCanvas.width, this.sourceCanvas.height) * 0.85;
      const targetAspect = this.targetW / this.targetH;
      let newH = baseDim / newZoom;
      let newW = newH * targetAspect;
      const cx = this.crop.x + this.crop.w / 2;
      const cy = this.crop.y + this.crop.h / 2;
      this.crop.w = Math.round(newW);
      this.crop.h = Math.round(newH);
      this.crop.x = Math.round(cx - newW / 2);
      this.crop.y = Math.round(cy - newH / 2);
      this.clampCropToBounds();
      this.requestRender();
    } else {
      // Step 2: Adjust Step 2 zoom (10% to 1600%)
      const zoomDelta = e.deltaY < 0 ? 0.05 : -0.05;
      const newZoom = Math.max(0.1, Math.min(16.0, Math.round((this.step2Zoom + zoomDelta) * 100) / 100));
      this.step2Zoom = newZoom;
      this.overlayEl.querySelector('#editorZoomSlider').value = newZoom;
      this.updateZoomInputDisplay();
      this.requestRender();
    }
  }
}
