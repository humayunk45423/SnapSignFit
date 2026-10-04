// js/editor.js - Three-Step Photoshop-Style Manual Crop, Straighten & Background Brush Editor
import { createCanvas, stepDownDownscale } from './loader.js';
import { parseLocalizedNumber, formatLocalizedNumber, getLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import { getSegmentationMask } from './bg.js';
import { extractSignatureMask, classifyImageContent } from './signature.js';

export class ManualEditor {
  constructor(options = {}) {
    this.container = options.container;
    this.sourceCanvas = null;
    this.targetW = 300;
    this.targetH = 300;
    this.preset = null;
    this.onApply = options.onApply || (() => {});
    this.onLiveUpdate = options.onLiveUpdate || (() => {});

    // Step state: 1 = Crop Frame, 2 = Straighten & Rotate, 3 = Background & Eraser Brush
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

    // Step 3 State (Background & Brush Touchup)
    this.step3BaseCanvas = null;
    this.maskCanvas = null;
    this.compositeBuffer = null;
    this.step3Zoom = 1.0;
    this.step3PanX = 0;
    this.step3PanY = 0;
    this.brushSize = 30; // 5 to 150 px
    this.brushHardness = 80; // 0% to 100%
    this.brushMode = 'erase'; // 'erase' or 'restore'
    this.brushCursor = { x: -100, y: -100, visible: false };
    this.isBrushing = false;
    this.lastBrushPoint = null;
    this.maskUndoStack = [];
    this.maskRedoStack = [];

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

    window.__manualEditor = this;
    this.straightenLineStart = null;
    this.straightenLineEnd = null;

    // Multi-touch Pointer Gesture tracking & Mobile Pinch
    this.activePointers = new Map();
    this.isPinching = false;
    this.pinchStart = null;
    this.lastPinchEndTime = 0;
    this.cooldownDuration = 350;
    this.hadSinglePointerStamp = false;
    this.maskSnapshotBeforeStroke = null;

    // Working & Preview Canvases
    this.editorCanvas = null;
    this.previewCanvas = null;

    // rAF Coalescing
    this.rafPending = false;

    this.initDOM();
  }

  initDOM() {
    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'editor-modal-overlay hidden';
    this.overlayEl.style.display = 'none';
    this.overlayEl.setAttribute('hidden', '');
    this.overlayEl.setAttribute('role', 'dialog');
    this.overlayEl.setAttribute('aria-modal', 'true');
    this.overlayEl.setAttribute('aria-label', 'Manual Image Editor');
    this.overlayEl.innerHTML = `
      <div class="editor-modal-dialog">
        <div class="editor-header">
          <div class="editor-header-top">
            <h3 class="editor-title" data-i18n="editorTitle">Manual Crop & Straighten</h3>
            <button type="button" class="editor-close-btn" id="editorCancelBtn" aria-label="Close" title="Close">&times;</button>
          </div>
          <div class="editor-step-tabs" role="tablist" aria-label="Editor Steps">
            <button type="button" class="editor-step-tab active" id="tabStep1" role="tab" aria-selected="true" data-step="1">
              ${icon('crop')} <span data-i18n="step1Crop">1. Crop Frame</span>
            </button>
            <button type="button" class="editor-step-tab" id="tabStep2" role="tab" aria-selected="false" data-step="2">
              ${icon('ruler')} <span data-i18n="step2Straighten">2. Straighten & Rotate</span>
            </button>
            <button type="button" class="editor-step-tab" id="tabStep3" role="tab" aria-selected="false" data-step="3">
              ${icon('brush')} <span data-i18n="step3Bg">3. Background & Brush</span>
            </button>
          </div>
        </div>

        <div class="editor-body">
          <div class="editor-viewport-wrapper">
            <!-- Fullscreen Topbar for Step 3 (Mobile) -->
            <div class="editor-fs-topbar" id="editorFsTopbar">
              <!-- TOP SECTION: Two halves side-by-side -->
              <div class="editor-fs-top-section">
                <!-- LEFT HALF: 1. Undo/Redo, 2. Tools, 3. Size, 4. Hardness -->
                <div class="editor-fs-left-col">
                  <!-- 1. Undo and Redo buttons (one row) -->
                  <div class="editor-fs-row-history">
                    <button type="button" class="btn-fs-action" id="fsBtnBrushUndo" title="Undo (Ctrl+Z)" disabled>
                      ${icon('rotate-ccw', { size: 14 })} <span data-i18n="undo">Undo</span>
                    </button>
                    <button type="button" class="btn-fs-action" id="fsBtnBrushRedo" title="Redo (Ctrl+Shift+Z / Ctrl+Y)" disabled>
                      ${icon('rotate-cw', { size: 14 })} <span data-i18n="redo">Redo</span>
                    </button>
                  </div>

                  <!-- 2. Three tool buttons: Eraser, Restore, Move (equal width) -->
                  <div class="editor-fs-row-tools">
                    <button type="button" class="btn-fs-tool active" id="fsBtnBrushErase" title="Eraser" aria-label="Eraser Tool">
                      ${icon('eraser', { size: 14 })} <span class="btn-fs-tool-label" data-i18n="brushErase">Eraser</span>
                    </button>
                    <button type="button" class="btn-fs-tool" id="fsBtnBrushRestore" title="Restore" aria-label="Restore Tool">
                      ${icon('brush', { size: 14 })} <span class="btn-fs-tool-label" data-i18n="brushRestore">Restore</span>
                    </button>
                    <button type="button" class="btn-fs-tool" id="fsBtnHandTool" aria-pressed="false" title="Move Canvas" aria-label="Move Canvas">
                      ${icon('hand', { size: 14 })} <span class="btn-fs-tool-label" data-i18n="moveTool">Move</span>
                    </button>
                  </div>

                  <!-- 3. Brush Size slider with value -->
                  <div class="editor-fs-slider-card">
                    <div class="editor-fs-slider-hdr">
                      <span class="editor-fs-slider-name" data-i18n="brushSize">Size</span>
                      <strong class="editor-fs-slider-val" id="fsBrushSizeVal">30px</strong>
                    </div>
                    <input type="range" id="fsBrushSizeSlider" min="5" max="150" step="1" value="30" class="editor-fs-range" aria-label="Brush Size Slider">
                  </div>

                  <!-- 4. Hardness slider with value -->
                  <div class="editor-fs-slider-card">
                    <div class="editor-fs-slider-hdr">
                      <span class="editor-fs-slider-name" data-i18n="brushHardness">Hardness</span>
                      <strong class="editor-fs-slider-val" id="fsBrushHardnessVal">80%</strong>
                    </div>
                    <input type="range" id="fsBrushHardnessSlider" min="0" max="100" step="1" value="80" class="editor-fs-range" aria-label="Brush Hardness Slider">
                  </div>
                </div>

                <!-- RIGHT HALF: 1. Exit button, 2. Live Preview window -->
                <div class="editor-fs-right-col">
                  <button type="button" class="btn-fs-exit" id="fsBtnExit" title="Exit Full Screen">
                    ${icon('x', { size: 14 })} <span data-i18n="btnExitFullscreen">Exit</span>
                  </button>

                  <div class="editor-fs-preview-wrap" id="editorFsPreviewWrap" role="button" tabindex="0" title="Click to enlarge live preview" aria-label="Click to enlarge live preview">
                    <div class="editor-fs-preview-hdr">
                      <span class="editor-fs-preview-tag" id="fsPreviewRatioTag">Preview</span>
                      <span class="editor-fs-preview-hint">${icon('maximize', { size: 11 })}</span>
                    </div>
                    <div class="editor-fs-preview-box">
                      <canvas id="editorFsLivePreviewCanvas" class="editor-fs-preview-canvas"></canvas>
                    </div>
                  </div>
                </div>
              </div>

              <!-- BOTTOM SECTION: Auto AI, Reset Background, Background Color Swatches -->
              <div class="editor-fs-bottom-section">
                <div class="editor-fs-actions-subrow">
                  <button type="button" class="btn-fs-action btn-fs-ai" id="fsBtnBrushAutoAi" title="Auto AI Remove Background">
                    ${icon('sparkles', { size: 14 })} <span data-i18n="btnAutoAiBg">Auto AI Remove</span>
                  </button>
                  <button type="button" class="btn-fs-action" id="fsBtnBrushResetMask" title="Reset Background to Original">
                    ${icon('refresh-ccw', { size: 14 })} <span data-i18n="btnResetBg">Reset Background</span>
                  </button>
                </div>

                <div class="editor-fs-palette-subrow">
                  <span class="editor-fs-palette-label"><span data-i18n="bgColor">Background</span>:</span>
                  <div class="editor-fs-palette-swatches">
                    <button type="button" class="fs-swatch active" data-color="#ffffff" title="Solid White" style="background: #ffffff;"></button>
                    <button type="button" class="fs-swatch" data-color="#dbeafe" title="Light Blue" style="background: #dbeafe;"></button>
                    <button type="button" class="fs-swatch" data-color="#f1f5f9" title="Light Gray" style="background: #f1f5f9;"></button>
                    <button type="button" class="fs-swatch" data-color="#dc2626" title="Solid Red" style="background: #dc2626;"></button>
                    <button type="button" class="fs-swatch" data-color="#2563eb" title="Royal Blue" style="background: #2563eb;"></button>
                    <label class="fs-swatch-picker" title="Custom Color">
                      <input type="color" id="fsCustomBgColor" value="#3b82f6" class="color-picker-mini">
                      <i class="fa fa-palette" style="font-size: 11px; color: var(--text);"></i>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div class="editor-viewport-container">
              <canvas id="editorInteractiveCanvas" class="editor-interactive-canvas"></canvas>
            </div>
            <div class="editor-help-bar" id="editorHelpBar">
              <div class="editor-help-text" id="editorHelpText" data-i18n="cropHint">
                Drag frame to move · Drag corners to resize
              </div>
              <button type="button" class="btn-editor-fs hidden" id="btnStep3Fullscreen" title="Full Screen Edit Mode" aria-label="Full Screen Edit Mode">
                <i class="fa-solid fa-expand"></i> <span data-i18n="btnFullscreen">Full Screen</span>
              </button>
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

              <!-- Step Navigation: Forward to Step 3 & Back to Crop -->
              <div class="editor-step-forward-row">
                <button type="button" class="btn btn-primary btn-block" id="btnCommitStraighten">
                  <span data-i18n="commitStraighten">Next: Background & Brush →</span>
                </button>
              </div>
              <div class="editor-step-back-row">
                <button type="button" class="btn btn-outline btn-sm btn-block" id="btnBackToStep1">
                  <span data-i18n="backToCrop">← Back to Crop Frame</span>
                </button>
              </div>
            </div>

            <!-- STEP 3 CONTROLS (Background & Eraser Brush) -->
            <div class="editor-step3-panel hidden" id="step3Controls">
              <!-- Mode Toggle -->
              <div class="brush-mode-group">
                <button type="button" class="btn btn-secondary btn-sm active" id="btnBrushErase">
                  ${icon('eraser')} <span data-i18n="brushErase">Eraser</span>
                </button>
                <button type="button" class="btn btn-secondary btn-sm" id="btnBrushRestore">
                  ${icon('brush')} <span data-i18n="brushRestore">Restore</span>
                </button>
                <button type="button" class="btn btn-secondary btn-sm" id="btnHandTool" aria-pressed="false" title="Move Canvas">
                  ${icon('hand')} <span data-i18n="moveTool">Move</span>
                </button>
              </div>

              <!-- Brush Size -->
              <div class="editor-control-group">
                <div class="editor-control-header">
                  <label for="brushSizeSlider" data-i18n="brushSize">Brush Size</label>
                  <div class="editor-input-wrap">
                    <input type="text" id="brushSizeInput" class="editor-num-input" value="30px" inputmode="numeric" aria-label="Brush Size">
                  </div>
                </div>
                <input type="range" id="brushSizeSlider" min="5" max="150" step="1" value="30" class="editor-slider" aria-label="Brush Size Slider">
              </div>

              <!-- Hardness -->
              <div class="editor-control-group">
                <div class="editor-control-header">
                  <label for="brushHardnessSlider" data-i18n="brushHardness">Hardness</label>
                  <div class="editor-input-wrap">
                    <input type="text" id="brushHardnessInput" class="editor-num-input" value="80%" inputmode="numeric" aria-label="Brush Hardness">
                  </div>
                </div>
                <input type="range" id="brushHardnessSlider" min="0" max="100" step="1" value="80" class="editor-slider" aria-label="Brush Hardness Slider">
              </div>

              <!-- Undo / Redo -->
              <div class="editor-btn-row">
                <button type="button" class="btn btn-secondary btn-sm" id="btnBrushUndo" title="Undo brush stroke (Ctrl+Z)">
                  ${icon('rotate-ccw')} <span data-i18n="undo">Undo</span>
                </button>
                <button type="button" class="btn btn-secondary btn-sm" id="btnBrushRedo" title="Redo brush stroke (Ctrl+Shift+Z)">
                  ${icon('rotate-cw')} <span data-i18n="redo">Redo</span>
                </button>
              </div>

              <!-- Background Solid Color Swatches -->
              <div class="editor-control-group">
                <div class="editor-control-header">
                  <label class="editor-label" data-i18n="bgColor">Background Color</label>
                </div>
                <div class="editor-bg-palette">
                  <button type="button" class="bg-swatch active" data-color="#ffffff" title="Solid White" style="background: #ffffff; border: 1px solid #cbd5e1;"></button>
                  <button type="button" class="bg-swatch" data-color="#dbeafe" title="Light Blue (Passport/Visa)" style="background: #dbeafe; border: 1px solid #93c5fd;"></button>
                  <button type="button" class="bg-swatch" data-color="#f1f5f9" title="Light Gray" style="background: #f1f5f9; border: 1px solid #cbd5e1;"></button>
                  <button type="button" class="bg-swatch" data-color="#dc2626" title="Solid Red" style="background: #dc2626; border: 1px solid #b91c1c;"></button>
                  <button type="button" class="bg-swatch" data-color="#2563eb" title="Royal Blue" style="background: #2563eb; border: 1px solid #1d4ed8;"></button>
                  <label class="bg-swatch-picker" title="Custom Color">
                    <input type="color" id="editorCustomBgColor" value="#3b82f6" class="color-picker-mini">
                    <i class="fa fa-palette" style="font-size: 11px; color: var(--text);"></i>
                  </label>
                </div>
              </div>

              <!-- AI Quick Remove & Reset (stacked to prevent sidebar overflow) -->
              <div class="editor-step3-action-col">
                <button type="button" class="btn btn-secondary btn-sm btn-block" id="btnBrushAutoAi" title="Auto AI Remove Background">
                  ${icon('sparkles')} <span data-i18n="btnAutoAiBg">Auto AI Remove</span>
                </button>
                <button type="button" class="btn btn-secondary btn-sm btn-block" id="btnBrushResetMask" title="Reset Background to Original">
                  ${icon('refresh-ccw')} <span data-i18n="btnResetBg">Reset Background</span>
                </button>
              </div>

              <!-- Step Navigation: Back to Straighten -->
              <div class="editor-step-back-row">
                <button type="button" class="btn btn-outline btn-sm btn-block" id="btnBackToStep2">
                  <span data-i18n="backToStraighten">← Back to Straighten</span>
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

        <!-- Full-screen Enlarged Live Preview Overlay -->
        <div class="editor-preview-modal-overlay hidden" id="editorPreviewModalOverlay" aria-modal="true" role="dialog">
          <div class="editor-preview-modal-backdrop" id="editorPreviewModalBackdrop"></div>
          <div class="editor-preview-modal-content" id="editorPreviewModalContent">
            <div class="editor-preview-modal-header">
              <div class="editor-preview-modal-title">
                <span data-i18n="after">Exact Output Preview</span>
                <span class="editor-preview-modal-dims" id="editorPreviewModalDims">300×300 px</span>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" id="btnExitEnlargedPreview" title="Exit Preview">
                ${icon('x', { size: 14 })} <span data-i18n="exitPreview">Exit Preview</span>
              </button>
            </div>
            <div class="editor-preview-modal-canvas-wrap" id="editorPreviewModalCanvasWrap">
              <canvas id="editorEnlargedPreviewCanvas" class="editor-enlarged-preview-canvas"></canvas>
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
    el.querySelector('#tabStep3').addEventListener('click', () => this.setStep(3));

    el.querySelector('#btnCommitCrop').addEventListener('click', () => this.setStep(2));
    el.querySelector('#btnBackToStep1').addEventListener('click', () => this.setStep(1));
    el.querySelector('#btnCommitStraighten').addEventListener('click', () => this.setStep(3));
    el.querySelector('#btnBackToStep2').addEventListener('click', () => this.setStep(2));

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

    // Step 3 Brush Mode Toggle (Eraser vs Restore vs Hand/Move)
    const btnErase = el.querySelector('#btnBrushErase');
    const btnRestore = el.querySelector('#btnBrushRestore');
    const btnHandTool = el.querySelector('#btnHandTool');

    const deactivateHandTool = () => {
      if (btnHandTool) {
        btnHandTool.setAttribute('aria-pressed', 'false');
        btnHandTool.classList.remove('active');
      }
      if (window.__editorPan?.setHandTool) {
        window.__editorPan.setHandTool(false);
      }
    };

    const fsBtnErase = el.querySelector('#fsBtnBrushErase');
    const fsBtnRestore = el.querySelector('#fsBtnBrushRestore');
    const fsBtnHand = el.querySelector('#fsBtnHandTool');

    const syncFsModeButtons = () => {
      const isHand = (btnHandTool ? (btnHandTool.classList.contains('active') || btnHandTool.getAttribute('aria-pressed') === 'true') : false) || (window.__editorPan?.isActive() || false);
      if (fsBtnHand) {
        fsBtnHand.classList.toggle('active', isHand);
        fsBtnHand.setAttribute('aria-pressed', String(isHand));
      }
      if (fsBtnErase) fsBtnErase.classList.toggle('active', !isHand && this.brushMode === 'erase');
      if (fsBtnRestore) fsBtnRestore.classList.toggle('active', !isHand && this.brushMode === 'restore');
    };

    btnErase.addEventListener('click', () => {
      this.brushMode = 'erase';
      btnErase.classList.add('active');
      btnRestore.classList.remove('active');
      deactivateHandTool();
      syncFsModeButtons();
      this.requestRender();
    });

    btnRestore.addEventListener('click', () => {
      this.brushMode = 'restore';
      btnRestore.classList.add('active');
      btnErase.classList.remove('active');
      deactivateHandTool();
      syncFsModeButtons();
      this.requestRender();
    });

    if (btnHandTool) {
      btnHandTool.addEventListener('click', (e) => {
        const currentlyOn = e.currentTarget.getAttribute('aria-pressed') === 'true' || e.currentTarget.classList.contains('active');
        const nextOn = !currentlyOn;
        e.currentTarget.setAttribute('aria-pressed', String(nextOn));
        e.currentTarget.classList.toggle('active', nextOn);

        if (window.__editorPan?.setHandTool) {
          window.__editorPan.setHandTool(nextOn);
        }

        if (nextOn) {
          btnErase.classList.remove('active');
          btnRestore.classList.remove('active');
        } else {
          // If turning move tool off, return active highlight to current brush mode
          if (this.brushMode === 'restore') {
            btnRestore.classList.add('active');
            btnErase.classList.remove('active');
          } else {
            btnErase.classList.add('active');
            btnRestore.classList.remove('active');
          }
        }
        syncFsModeButtons();
      });
    }

    // Fullscreen Mode Tool Bindings
    if (fsBtnErase) {
      fsBtnErase.addEventListener('click', () => {
        btnErase.click();
        syncFsModeButtons();
      });
    }

    if (fsBtnRestore) {
      fsBtnRestore.addEventListener('click', () => {
        btnRestore.click();
        syncFsModeButtons();
      });
    }

    if (fsBtnHand) {
      fsBtnHand.addEventListener('click', () => {
        if (btnHandTool) btnHandTool.click();
        syncFsModeButtons();
      });
    }

    // Step 3 Fullscreen Enter & Exit Buttons
    const btnFs = el.querySelector('#btnStep3Fullscreen');
    if (btnFs) {
      btnFs.addEventListener('click', () => this.toggleStep3Fullscreen(true));
    }
    const btnExitFs = el.querySelector('#fsBtnExit');
    if (btnExitFs) {
      btnExitFs.addEventListener('click', () => this.toggleStep3Fullscreen(false));
    }

    // Step 3 Live Preview Click to Enlarge
    const fsPreviewWrap = el.querySelector('#editorFsPreviewWrap');
    if (fsPreviewWrap) {
      fsPreviewWrap.addEventListener('click', () => this.openEnlargedPreview());
      fsPreviewWrap.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.openEnlargedPreview();
        }
      });
    }

    const btnExitEnlarged = el.querySelector('#btnExitEnlargedPreview');
    if (btnExitEnlarged) {
      btnExitEnlarged.addEventListener('click', () => this.closeEnlargedPreview());
    }

    const backdropEnlarged = el.querySelector('#editorPreviewModalBackdrop');
    if (backdropEnlarged) {
      backdropEnlarged.addEventListener('click', () => this.closeEnlargedPreview());
    }

    // Step 3 Background Color Swatches & Two-Way Sync
    const swatches = el.querySelectorAll('.bg-swatch');
    const fsSwatches = el.querySelectorAll('.fs-swatch');
    const customBgInput = el.querySelector('#editorCustomBgColor');
    const fsCustomBg = el.querySelector('#fsCustomBgColor');

    const syncSwatches = (color, pushHistoryState = true) => {
      if (this.bgColor !== color) {
        if (pushHistoryState && this.currentStep === 3) {
          this.pushMaskHistory();
        }
        this.bgColor = color;
      }
      swatches.forEach(s => s.classList.toggle('active', s.dataset.color === color));
      fsSwatches.forEach(s => s.classList.toggle('active', s.dataset.color === color));
      if (customBgInput && customBgInput.value !== color) customBgInput.value = color;
      if (fsCustomBg && fsCustomBg.value !== color) fsCustomBg.value = color;
      this.requestRender();
    };

    this.syncSwatchesFromBgColor = (color) => syncSwatches(color, false);

    swatches.forEach(swatch => {
      swatch.addEventListener('click', () => syncSwatches(swatch.dataset.color));
    });
    fsSwatches.forEach(swatch => {
      swatch.addEventListener('click', () => syncSwatches(swatch.dataset.color));
    });

    if (customBgInput) {
      customBgInput.addEventListener('input', (e) => syncSwatches(e.target.value));
    }
    if (fsCustomBg) {
      fsCustomBg.addEventListener('input', (e) => syncSwatches(e.target.value));
    }

    // Step 3 Brush Size Slider & Input
    const brushSizeSlider = el.querySelector('#brushSizeSlider');
    const brushSizeInput = el.querySelector('#brushSizeInput');
    const fsBrushSizeSlider = el.querySelector('#fsBrushSizeSlider');

    brushSizeSlider.addEventListener('input', (e) => {
      this.brushSize = parseInt(e.target.value, 10) || 30;
      this.updateBrushSizeInputDisplay();
      this.requestRender();
    });

    if (fsBrushSizeSlider) {
      fsBrushSizeSlider.addEventListener('input', (e) => {
        this.brushSize = parseInt(e.target.value, 10) || 30;
        brushSizeSlider.value = this.brushSize;
        this.updateBrushSizeInputDisplay();
        this.requestRender();
      });
    }

    this.bindNumericInput(brushSizeInput, {
      getVal: () => this.brushSize,
      setVal: (v) => {
        this.brushSize = Math.max(5, Math.min(150, Math.round(v)));
        brushSizeSlider.value = this.brushSize;
        this.updateBrushSizeInputDisplay();
        this.requestRender();
      },
      step: 1,
      min: 5,
      max: 150,
      format: (v) => `${Math.round(v)}px`
    });

    // Step 3 Brush Hardness Slider & Input
    const brushHardnessSlider = el.querySelector('#brushHardnessSlider');
    const brushHardnessInput = el.querySelector('#brushHardnessInput');
    const fsBrushHardnessSlider = el.querySelector('#fsBrushHardnessSlider');

    brushHardnessSlider.addEventListener('input', (e) => {
      this.brushHardness = parseInt(e.target.value, 10) || 80;
      this.updateBrushHardnessInputDisplay();
    });

    if (fsBrushHardnessSlider) {
      fsBrushHardnessSlider.addEventListener('input', (e) => {
        this.brushHardness = parseInt(e.target.value, 10) || 80;
        brushHardnessSlider.value = this.brushHardness;
        this.updateBrushHardnessInputDisplay();
      });
    }

    this.bindNumericInput(brushHardnessInput, {
      getVal: () => this.brushHardness,
      setVal: (v) => {
        this.brushHardness = Math.max(0, Math.min(100, Math.round(v)));
        brushHardnessSlider.value = this.brushHardness;
        this.updateBrushHardnessInputDisplay();
      },
      step: 1,
      min: 0,
      max: 100,
      format: (v) => `${Math.round(v)}%`
    });

    // Step 3 Quick Action Buttons
    el.querySelector('#btnBrushAutoAi')?.addEventListener('click', () => this.autoAiRemoveBg());
    el.querySelector('#btnBrushResetMask')?.addEventListener('click', () => this.resetMask());
    el.querySelector('#fsBtnBrushAutoAi')?.addEventListener('click', () => this.autoAiRemoveBg());
    el.querySelector('#fsBtnBrushResetMask')?.addEventListener('click', () => this.resetMask());

    // Step 3 Undo / Redo Buttons
    el.querySelector('#btnBrushUndo')?.addEventListener('click', () => {
      this.undoMask();
    });
    el.querySelector('#btnBrushRedo')?.addEventListener('click', () => {
      this.redoMask();
    });
    el.querySelector('#fsBtnBrushUndo')?.addEventListener('click', () => {
      this.undoMask();
    });
    el.querySelector('#fsBtnBrushRedo')?.addEventListener('click', () => {
      this.redoMask();
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

    // Keyboard Shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y, Esc, Enter)
    // NOTE: Space pan is handled exclusively by editor-pan.js — do NOT re-add Space handling here.
    window.addEventListener('keydown', (e) => {
      if (this.overlayEl.classList.contains('hidden')) return;
      if (e.target.tagName === 'INPUT') return;

      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        if (this.isBrushing) return; // Never fire mid-stroke
        if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
          this.redo();
        } else {
          this.undo();
        }
      } else if (e.key === 'Escape') {
        const enlarged = this.overlayEl.querySelector('#editorPreviewModalOverlay');
        if (enlarged && !enlarged.classList.contains('hidden')) {
          this.closeEnlargedPreview();
          return;
        }
        const dialog = this.overlayEl.querySelector('.editor-modal-dialog');
        if (dialog && dialog.classList.contains('step3-fullscreen-active')) {
          this.toggleStep3Fullscreen(false);
          return;
        }
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
    window.addEventListener('pointercancel', (e) => this.onPointerCancel(e));
    this.editorCanvas.addEventListener('pointerleave', () => {
      if (this.currentStep === 3 && !this.isPinching) {
        this.brushCursor.visible = false;
        this.requestRender();
      }
    });
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

  updateBrushSizeInputDisplay() {
    const formatted = `${Math.round(this.brushSize)}px`;
    const inp = this.overlayEl.querySelector('#brushSizeInput');
    if (inp && document.activeElement !== inp) inp.value = formatted;
    const fsSlider = this.overlayEl.querySelector('#fsBrushSizeSlider');
    if (fsSlider && document.activeElement !== fsSlider) fsSlider.value = this.brushSize;
    const fsVal = this.overlayEl.querySelector('#fsBrushSizeVal');
    if (fsVal) fsVal.textContent = formatted;
  }

  updateBrushHardnessInputDisplay() {
    const formatted = `${Math.round(this.brushHardness)}%`;
    const inp = this.overlayEl.querySelector('#brushHardnessInput');
    if (inp && document.activeElement !== inp) inp.value = formatted;
    const fsSlider = this.overlayEl.querySelector('#fsBrushHardnessSlider');
    if (fsSlider && document.activeElement !== fsSlider) fsSlider.value = this.brushHardness;
    const fsVal = this.overlayEl.querySelector('#fsBrushHardnessVal');
    if (fsVal) fsVal.textContent = formatted;
  }

  setStep(stepNumber) {
    if (stepNumber === 2 && this.currentStep === 1) {
      this.commitCropToBitmap();
    } else if (stepNumber === 3) {
      if (this.currentStep === 1) {
        this.commitCropToBitmap();
      }
      this.commitStep2ToBitmap();
      if (window.__editorPan?.reset) {
        window.__editorPan.reset();
      }
    } else if (this.currentStep === 3) {
      this.step3PanX = 0;
      this.step3PanY = 0;
      this.step3Zoom = 1.0;
    }
    this.activePointers.clear();
    this.isPinching = false;
    this.pinchStart = null;
    this.lastPinchEndTime = 0;
    this.isBrushing = false;
    this.lastBrushPoint = null;
    this.hadSinglePointerStamp = false;
    this.maskSnapshotBeforeStroke = null;
    this.isDragging = false;
    this.isResizing = false;
    this.currentStep = stepNumber;

    const tab1 = this.overlayEl.querySelector('#tabStep1');
    const tab2 = this.overlayEl.querySelector('#tabStep2');
    const tab3 = this.overlayEl.querySelector('#tabStep3');
    const p1 = this.overlayEl.querySelector('#step1Controls');
    const p2 = this.overlayEl.querySelector('#step2Controls');
    const p3 = this.overlayEl.querySelector('#step3Controls');
    const help = this.overlayEl.querySelector('#editorHelpText');
    const btnFs = this.overlayEl.querySelector('#btnStep3Fullscreen');

    tab1?.classList.toggle('active', stepNumber === 1);
    tab1?.setAttribute('aria-selected', stepNumber === 1 ? 'true' : 'false');
    tab2?.classList.toggle('active', stepNumber === 2);
    tab2?.setAttribute('aria-selected', stepNumber === 2 ? 'true' : 'false');
    tab3?.classList.toggle('active', stepNumber === 3);
    tab3?.setAttribute('aria-selected', stepNumber === 3 ? 'true' : 'false');

    // p1 (commit crop button) is only shown in step 1
    if (p1) p1.classList.toggle('hidden', stepNumber !== 1);
    // p2 (rotation/flip/straighten tools) stays visible in steps 1 & 2 — matches original
    // behavior where rotation buttons were always accessible; hidden only in step 3
    if (p2) p2.classList.toggle('hidden', stepNumber === 3);
    // p3 (brush controls) is only shown in step 3
    if (p3) p3.classList.toggle('hidden', stepNumber !== 3);

    // Full Screen Button: visible only in Step 3 (mobile view)
    if (btnFs) {
      btnFs.classList.toggle('hidden', stepNumber !== 3);
    }
    if (stepNumber !== 3) {
      this.toggleStep3Fullscreen(false);
    }

    // Ensure hand/move tool is deactivated when switching steps
    if (stepNumber !== 3) {
      const btnHand = this.overlayEl.querySelector('#btnHandTool');
      if (btnHand) {
        btnHand.setAttribute('aria-pressed', 'false');
        btnHand.classList.remove('active');
      }
      if (window.__editorPan?.setHandTool) {
        window.__editorPan.setHandTool(false);
      }
    }

    if (this.editorCanvas) {
      this.editorCanvas.classList.toggle('brush-mode', stepNumber === 3);
    }

    if (help) {
      if (stepNumber === 1) help.textContent = t('cropHint');
      else if (stepNumber === 2) help.textContent = t('straightenHintStep2');
      else if (stepNumber === 3) help.textContent = t('brushHint');
    }

    this.redraw();
  }

  commitCropToBitmap() {
    if (!this.sourceCanvas || this.sourceCanvas.width <= 0 || this.sourceCanvas.height <= 0) return;
    if (!this.crop || !this.crop.w || !this.crop.h || this.crop.w <= 0 || this.crop.h <= 0) {
      this.resetCropToCenter();
    }
    const { x = 0, y = 0, w = 1, h = 1 } = this.crop || {};
    const clampedW = Math.max(1, Math.round(w));
    const clampedH = Math.max(1, Math.round(h));

    const patch = createCanvas(clampedW, clampedH);
    const pCtx = patch.getContext('2d');
    if (!this.transparent) {
      pCtx.fillStyle = this.bgColor;
      pCtx.fillRect(0, 0, clampedW, clampedH);
    }
    if (this.sourceCanvas.width > 0 && this.sourceCanvas.height > 0 && clampedW > 0 && clampedH > 0) {
      pCtx.drawImage(this.sourceCanvas, x, y, clampedW, clampedH, 0, 0, clampedW, clampedH);
    }
    this.croppedCanvas = patch;
  }

  commitStep2ToBitmap() {
    if (!this.croppedCanvas || this.croppedCanvas.width <= 0 || this.croppedCanvas.height <= 0) {
      this.commitCropToBitmap();
    }
    const bmp = this.croppedCanvas;
    if (!bmp || bmp.width <= 0 || bmp.height <= 0) return;
    const totalDeg = this.rotation + this.straightenDeg;

    this.step3BaseCanvas = createCanvas(this.targetW, this.targetH);
    const ctx = this.step3BaseCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

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
    if (bmp.width > 0 && bmp.height > 0) {
      ctx.drawImage(bmp, 0, 0);
    }
    ctx.restore();

    if (!this.maskCanvas || this.maskCanvas.width !== this.targetW || this.maskCanvas.height !== this.targetH) {
      this.maskCanvas = createCanvas(this.targetW, this.targetH);
      const mCtx = this.maskCanvas.getContext('2d');
      mCtx.fillStyle = '#ffffff';
      mCtx.fillRect(0, 0, this.targetW, this.targetH);
      this.maskUndoStack = [];
      this.maskRedoStack = [];
    }
  }

  open(sourceCanvas, targetW, targetH, initialCrop = null, preset = null, options = {}) {
    this.sourceCanvas = sourceCanvas;
    this.targetW = Math.max(1, targetW || 300);
    this.targetH = Math.max(1, targetH || 300);
    this.preset = preset;
    this.bgColor = options.bgColor || '#ffffff';
    this.transparent = options.transparent || false;

    // Reset / restore initial transforms
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

    if (options.step2Transform) {
      if (options.step2Transform.rotation !== undefined) this.rotation = options.step2Transform.rotation;
      if (options.step2Transform.straightenDeg !== undefined) this.straightenDeg = options.step2Transform.straightenDeg;
      if (options.step2Transform.zoom !== undefined) this.step2Zoom = options.step2Transform.zoom;
      if (options.step2Transform.panX !== undefined) this.step2PanX = options.step2Transform.panX;
      if (options.step2Transform.panY !== undefined) this.step2PanY = options.step2Transform.panY;
      if (options.step2Transform.flipH !== undefined) this.flipH = options.step2Transform.flipH;
      if (options.step2Transform.flipV !== undefined) this.flipV = options.step2Transform.flipV;
    }

    // Step 3 state
    this.step3BaseCanvas = null;
    this.maskCanvas = options.maskCanvas || null;
    this.croppedCanvas = options.croppedCanvas || null;
    this.step3Zoom = 1.0;
    this.step3PanX = 0;
    this.step3PanY = 0;
    this.maskUndoStack = [];
    this.maskRedoStack = [];
    this.brushMode = 'erase';
    this.brushCursor = { x: -100, y: -100, visible: false };

    const btnErase = this.overlayEl.querySelector('#btnBrushErase');
    const btnRestore = this.overlayEl.querySelector('#btnBrushRestore');
    if (btnErase && btnRestore) {
      btnErase.classList.add('active');
      btnRestore.classList.remove('active');
    }

    this.overlayEl.querySelector('#allowPaddingCheck').checked = this.allowPadding;
    this.overlayEl.querySelector('#straightenSlider').value = this.straightenDeg;
    this.overlayEl.querySelector('#editorZoomSlider').value = this.step2Zoom;
    this.overlayEl.querySelector('#brushSizeSlider').value = this.brushSize;
    this.overlayEl.querySelector('#brushHardnessSlider').value = this.brushHardness;
    this.updateStraightenInputDisplay();
    this.updateZoomInputDisplay();
    this.updateBrushSizeInputDisplay();
    this.updateBrushHardnessInputDisplay();
    this.overlayEl.querySelector('#editorDimText').textContent = `${this.targetW}×${this.targetH} px`;

    if (initialCrop && initialCrop.w > 0 && initialCrop.h > 0) {
      const cropAspect = initialCrop.w / initialCrop.h;
      const targetAspect = this.targetW / this.targetH;
      if (Math.abs(cropAspect - targetAspect) / targetAspect < 0.08) {
        this.crop = { ...initialCrop };
        this.autoDetectedCrop = { ...initialCrop };
      } else {
        const cx = initialCrop.x + initialCrop.w / 2;
        const cy = initialCrop.y + initialCrop.h / 2;
        let cw = initialCrop.w;
        let ch = cw / targetAspect;
        if (ch > sourceCanvas.height * 0.95) {
          ch = sourceCanvas.height * 0.95;
          cw = ch * targetAspect;
        }
        if (cw > sourceCanvas.width * 0.95) {
          cw = sourceCanvas.width * 0.95;
          ch = cw / targetAspect;
        }
        this.crop = {
          x: Math.max(0, Math.round(cx - cw / 2)),
          y: Math.max(0, Math.round(cy - ch / 2)),
          w: Math.round(cw),
          h: Math.round(ch)
        };
        this.clampCropToBounds();
        this.autoDetectedCrop = { ...this.crop };
      }
    } else {
      this.resetCropToCenter();
      this.autoDetectedCrop = { ...this.crop };
    }

    this.toggleStep3Fullscreen(false);
    this.commitCropToBitmap();
    this.setStep(1);

    this.overlayEl.removeAttribute('hidden');
    this.overlayEl.classList.remove('hidden');
    this.overlayEl.style.display = 'flex';
    this.resizeEditorCanvas();
    this.redraw();
  }

  toggleStep3Fullscreen(enable) {
    const dialog = this.overlayEl.querySelector('.editor-modal-dialog');
    if (!dialog) return;

    const isFs = (enable !== undefined) ? !!enable : !dialog.classList.contains('step3-fullscreen-active');
    dialog.classList.toggle('step3-fullscreen-active', isFs);

    const btnFs = this.overlayEl.querySelector('#btnStep3Fullscreen');
    if (btnFs) {
      btnFs.classList.toggle('active', isFs);
      btnFs.setAttribute('aria-pressed', String(isFs));
    }

    if (isFs) {
      this.updateBrushSizeInputDisplay();
      this.updateBrushHardnessInputDisplay();
      this.updateBrushUndoRedoState();

      const fsBtnErase = this.overlayEl.querySelector('#fsBtnBrushErase');
      const fsBtnRestore = this.overlayEl.querySelector('#fsBtnBrushRestore');
      const fsBtnHand = this.overlayEl.querySelector('#fsBtnHandTool');
      const btnHandTool = this.overlayEl.querySelector('#btnHandTool');
      const isHand = (btnHandTool ? (btnHandTool.classList.contains('active') || btnHandTool.getAttribute('aria-pressed') === 'true') : false) || (window.__editorPan?.isActive() || false);
      if (fsBtnHand) {
        fsBtnHand.classList.toggle('active', isHand);
        fsBtnHand.setAttribute('aria-pressed', String(isHand));
      }
      if (fsBtnErase) fsBtnErase.classList.toggle('active', !isHand && this.brushMode === 'erase');
      if (fsBtnRestore) fsBtnRestore.classList.toggle('active', !isHand && this.brushMode === 'restore');

      const fsSwatches = this.overlayEl.querySelectorAll('.fs-swatch');
      fsSwatches.forEach(s => s.classList.toggle('active', s.dataset.color === this.bgColor));
    }

    this.resizeEditorCanvas();
    this.redraw();
  }

  close() {
    this.toggleStep3Fullscreen(false);
    this.activePointers.clear();
    this.isPinching = false;
    this.pinchStart = null;
    this.lastPinchEndTime = 0;
    this.isBrushing = false;
    this.lastBrushPoint = null;
    this.hadSinglePointerStamp = false;
    this.maskSnapshotBeforeStroke = null;
    this.isDragging = false;
    this.isResizing = false;
    this.overlayEl.classList.add('hidden');
    this.overlayEl.style.display = 'none';
    this.overlayEl.setAttribute('hidden', '');
  }

  apply() {
    if (this.currentStep === 1) {
      this.commitCropToBitmap();
    }
    this.close();

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
      maskCanvas: this.maskCanvas,
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
    this.step3BaseCanvas = null;
    this.maskCanvas = null;
    this.step3Zoom = 1.0;
    this.step3PanX = 0;
    this.step3PanY = 0;
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

  createMaskSnapshot() {
    if (!this.maskCanvas) return null;
    const copy = createCanvas(this.maskCanvas.width, this.maskCanvas.height);
    copy.getContext('2d').drawImage(this.maskCanvas, 0, 0);
    return {
      mask: copy,
      bgColor: this.bgColor
    };
  }

  pushMaskHistory(snapshot) {
    if (!this.maskCanvas) return;
    const state = snapshot || this.createMaskSnapshot();
    if (!state) return;
    this.maskUndoStack.push(state);
    if (this.maskUndoStack.length > 40) {
      this.maskUndoStack.shift();
    }
    this.maskRedoStack = [];
    this.updateBrushUndoRedoState();
  }

  undo() {
    if (this.currentStep === 3) {
      this.undoMask();
      return;
    }
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

  undoMask() {
    if (this.maskUndoStack.length === 0 || !this.maskCanvas) return;
    const current = this.createMaskSnapshot();
    if (current) this.maskRedoStack.push(current);

    const prev = this.maskUndoStack.pop();
    if (prev && prev.mask) {
      const mCtx = this.maskCanvas.getContext('2d');
      mCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
      mCtx.drawImage(prev.mask, 0, 0);
      if (prev.bgColor && prev.bgColor !== this.bgColor) {
        this.bgColor = prev.bgColor;
        if (this.syncSwatchesFromBgColor) this.syncSwatchesFromBgColor(this.bgColor);
      }
    }
    this.updateBrushUndoRedoState();
    this.requestRender();
  }

  redo() {
    if (this.currentStep === 3) {
      this.redoMask();
      return;
    }
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

  redoMask() {
    if (this.maskRedoStack.length === 0 || !this.maskCanvas) return;
    const current = this.createMaskSnapshot();
    if (current) this.maskUndoStack.push(current);

    const next = this.maskRedoStack.pop();
    if (next && next.mask) {
      const mCtx = this.maskCanvas.getContext('2d');
      mCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
      mCtx.drawImage(next.mask, 0, 0);
      if (next.bgColor && next.bgColor !== this.bgColor) {
        this.bgColor = next.bgColor;
        if (this.syncSwatchesFromBgColor) this.syncSwatchesFromBgColor(this.bgColor);
      }
    }
    this.updateBrushUndoRedoState();
    this.requestRender();
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

  updateBrushUndoRedoState() {
    const canUndo = this.maskUndoStack.length > 0;
    const canRedo = this.maskRedoStack.length > 0;

    const undoBtn = this.overlayEl.querySelector('#btnBrushUndo');
    const redoBtn = this.overlayEl.querySelector('#btnBrushRedo');
    if (undoBtn) undoBtn.disabled = !canUndo;
    if (redoBtn) redoBtn.disabled = !canRedo;

    const fsUndoBtn = this.overlayEl.querySelector('#fsBtnBrushUndo');
    const fsRedoBtn = this.overlayEl.querySelector('#fsBtnBrushRedo');
    if (fsUndoBtn) fsUndoBtn.disabled = !canUndo;
    if (fsRedoBtn) fsRedoBtn.disabled = !canRedo;
  }

  openEnlargedPreview() {
    const overlay = this.overlayEl.querySelector('#editorPreviewModalOverlay');
    const content = this.overlayEl.querySelector('#editorPreviewModalContent');
    const trigger = this.overlayEl.querySelector('#editorFsLivePreviewCanvas') || this.overlayEl.querySelector('#editorFsPreviewWrap');
    if (!overlay || !content) return;

    this.renderEnlargedPreview();
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Shared-element FLIP animation originating precisely from the preview thumbnail window
    if (trigger) {
      const startRect = trigger.getBoundingClientRect();
      const endRect = content.getBoundingClientRect();
      const scaleX = Math.max(0.05, startRect.width / Math.max(1, endRect.width));
      const scaleY = Math.max(0.05, startRect.height / Math.max(1, endRect.height));
      const translateX = (startRect.left + startRect.width / 2) - (endRect.left + endRect.width / 2);
      const translateY = (startRect.top + startRect.height / 2) - (endRect.top + endRect.height / 2);

      content.style.transformOrigin = 'center center';
      content.style.transition = 'none';
      content.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`;
      content.style.opacity = '0';

      // Force synchronous reflow so browser commits the starting transform at the preview window
      void content.offsetHeight;

      requestAnimationFrame(() => {
        content.style.transition = 'transform 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s ease';
        content.style.transform = 'translate(0px, 0px) scale(1, 1)';
        content.style.opacity = '1';
      });
    }
  }

  closeEnlargedPreview(instant = false) {
    const overlay = this.overlayEl.querySelector('#editorPreviewModalOverlay');
    const content = this.overlayEl.querySelector('#editorPreviewModalContent');
    const trigger = this.overlayEl.querySelector('#editorFsLivePreviewCanvas') || this.overlayEl.querySelector('#editorFsPreviewWrap');
    if (!overlay || overlay.classList.contains('hidden')) return;

    if (instant || !trigger || !content) {
      overlay.classList.add('hidden');
      if (content) {
        content.style.transform = '';
        content.style.opacity = '';
      }
      document.body.style.overflow = '';
      return;
    }

    const startRect = content.getBoundingClientRect();
    const endRect = trigger.getBoundingClientRect();
    const scaleX = Math.max(0.05, endRect.width / Math.max(1, startRect.width));
    const scaleY = Math.max(0.05, endRect.height / Math.max(1, startRect.height));
    const translateX = (endRect.left + endRect.width / 2) - (startRect.left + startRect.width / 2);
    const translateY = (endRect.top + endRect.height / 2) - (startRect.top + startRect.height / 2);

    content.style.transformOrigin = 'center center';
    content.style.transition = 'transform 0.25s cubic-bezier(0.2, 0, 0, 1), opacity 0.2s ease';
    content.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`;
    content.style.opacity = '0';

    setTimeout(() => {
      overlay.classList.add('hidden');
      content.style.transform = '';
      content.style.opacity = '';
      document.body.style.overflow = '';
    }, 250);
  }

  renderEnlargedPreview() {
    const canvas = this.overlayEl.querySelector('#editorEnlargedPreviewCanvas');
    if (!canvas) return;

    canvas.width = this.targetW;
    canvas.height = this.targetH;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (!this.transparent) {
      ctx.fillStyle = this.bgColor;
      ctx.fillRect(0, 0, this.targetW, this.targetH);
    } else {
      ctx.clearRect(0, 0, this.targetW, this.targetH);
    }

    const comp = this.getCompositedStep3Canvas();
    if (comp) ctx.drawImage(comp, 0, 0, this.targetW, this.targetH);

    const dimsEl = this.overlayEl.querySelector('#editorPreviewModalDims');
    if (dimsEl) dimsEl.textContent = `${this.targetW}×${this.targetH} px`;
  }

  applyBrushStamp(imgX, imgY) {
    if (!this.maskCanvas) return;
    const mCtx = this.maskCanvas.getContext('2d');
    const radius = this.brushSize / 2;
    const hardness = Math.max(0, Math.min(100, this.brushHardness)) / 100;

    mCtx.save();
    if (this.brushMode === 'erase') {
      mCtx.globalCompositeOperation = 'destination-out';
      mCtx.fillStyle = '#000000';
    } else {
      mCtx.globalCompositeOperation = 'source-over';
      mCtx.fillStyle = '#ffffff';
    }

    // Fix for 100% (or >= 99%) hardness: HTML5 Canvas spec creates degenerate zero-pixel gradient when r0 === r1
    if (hardness >= 0.99) {
      mCtx.beginPath();
      mCtx.arc(imgX, imgY, radius, 0, Math.PI * 2);
      mCtx.fill();
      mCtx.restore();
      return;
    }

    const innerRadius = radius * hardness;
    const safeInnerRadius = Math.min(radius - 0.05, innerRadius);
    const grad = mCtx.createRadialGradient(imgX, imgY, safeInnerRadius, imgX, imgY, radius);

    if (this.brushMode === 'erase') {
      grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else {
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    }

    mCtx.fillStyle = grad;
    mCtx.beginPath();
    mCtx.arc(imgX, imgY, radius, 0, Math.PI * 2);
    mCtx.fill();
    mCtx.restore();
  }

  applyBrushStroke(x0, y0, x1, y1) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const step = Math.max(1, (this.brushSize / 2) * 0.2);
    const steps = Math.max(1, Math.ceil(dist / step));

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      this.applyBrushStamp(x, y);
    }
  }

  async autoAiRemoveBg() {
    if (!this.step3BaseCanvas) this.commitStep2ToBitmap();
    this.pushMaskHistory();
    try {
      const isSig = this.preset?.kind === 'signature' || classifyImageContent(this.step3BaseCanvas) === 'signature';
      let mask = null;
      if (isSig) {
        mask = extractSignatureMask(this.step3BaseCanvas);
      } else {
        mask = await getSegmentationMask(this.step3BaseCanvas);
        // Fallback: If portrait segmentation returned null or an empty mask (e.g. signature or drawing), use ink extraction
        if (!mask || this.isMaskVirtuallyEmpty(mask)) {
          mask = extractSignatureMask(this.step3BaseCanvas);
        }
      }
      if (mask && this.maskCanvas) {
        const mCtx = this.maskCanvas.getContext('2d');
        mCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
        mCtx.drawImage(mask, 0, 0, this.maskCanvas.width, this.maskCanvas.height);
        this.requestRender();
      }
    } catch (err) {
      console.warn('Auto AI segmentation failed in editor brush:', err);
    }
  }

  isMaskVirtuallyEmpty(maskCanvas) {
    if (!maskCanvas || maskCanvas.width <= 0 || maskCanvas.height <= 0) return true;
    try {
      const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
      const imgData = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
      const data = imgData.data;
      let visibleCount = 0;
      const total = maskCanvas.width * maskCanvas.height;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 20) visibleCount++;
      }
      return (visibleCount / total) < 0.02; // < 2% visible foreground means portrait AI missed
    } catch (e) {
      return false;
    }
  }

  resetMask() {
    if (!this.maskCanvas) return;
    this.pushMaskHistory();
    const mCtx = this.maskCanvas.getContext('2d');
    mCtx.fillStyle = '#ffffff';
    mCtx.fillRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
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
    } else if (this.currentStep === 2) {
      this.drawStep2Straighten(ctx, cw, ch);
    } else {
      this.drawStep3Brush(ctx, cw, ch);
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
      { x: cropScreenX, y: cropScreenY },
      { x: cropScreenX + cropScreenW / 2, y: cropScreenY },
      { x: cropScreenX + cropScreenW, y: cropScreenY },
      { x: cropScreenX + cropScreenW, y: cropScreenY + cropScreenH / 2 },
      { x: cropScreenX + cropScreenW, y: cropScreenY + cropScreenH },
      { x: cropScreenX + cropScreenW / 2, y: cropScreenY + cropScreenH },
      { x: cropScreenX, y: cropScreenY + cropScreenH },
      { x: cropScreenX, y: cropScreenY + cropScreenH / 2 }
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
    if (bmp && bmp.width > 0 && bmp.height > 0 && baseScale > 0) {
      ctx.drawImage(bmp, -bmpW / 2 * baseScale, -bmpH / 2 * baseScale, bmpW * baseScale, bmpH * baseScale);
    }

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

  drawStep3Brush(ctx, cw, ch) {
    if (!this.step3BaseCanvas) this.commitStep2ToBitmap();
    const baseScale = Math.min((cw - 40) / this.targetW, (ch - 40) / this.targetH) * (this.step3Zoom || 1.0);
    const cx = cw / 2 + (this.step3PanX || 0);
    const cy = ch / 2 + (this.step3PanY || 0);

    this.displayScale = baseScale;
    this.displayOffsetX = cx;
    this.displayOffsetY = cy;

    // Viewport background
    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, cw, ch);

    const screenW = this.targetW * baseScale;
    const screenH = this.targetH * baseScale;
    const screenX = cx - screenW / 2;
    const screenY = cy - screenH / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(screenX, screenY, screenW, screenH);
    ctx.clip();
    this.drawCheckerPattern(ctx, cw, ch);

    const comp = this.getCompositedStep3Canvas();
    if (comp && comp.width > 0 && comp.height > 0 && screenW > 0 && screenH > 0) {
      ctx.drawImage(comp, screenX, screenY, screenW, screenH);
    }
    ctx.restore();

    // Output boundary guide box
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(screenX, screenY, screenW, screenH);

    // Brush cursor circle outline
    if (this.brushCursor.visible) {
      const radius = (this.brushSize / 2) * baseScale;
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.brushCursor.x, this.brushCursor.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = this.brushMode === 'erase' ? '#ef4444' : '#22c55e';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(this.brushCursor.x, this.brushCursor.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
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

  getCompositedStep3Canvas() {
    if (!this.step3BaseCanvas) this.commitStep2ToBitmap();
    if (!this.compositeBuffer || this.compositeBuffer.width !== this.targetW || this.compositeBuffer.height !== this.targetH) {
      this.compositeBuffer = createCanvas(this.targetW, this.targetH);
    }
    const cCtx = this.compositeBuffer.getContext('2d');
    cCtx.clearRect(0, 0, this.targetW, this.targetH);
    cCtx.drawImage(this.step3BaseCanvas, 0, 0);

    if (this.maskCanvas) {
      cCtx.globalCompositeOperation = 'destination-in';
      cCtx.drawImage(this.maskCanvas, 0, 0);
      cCtx.globalCompositeOperation = 'source-over';
    }
    return this.compositeBuffer;
  }

  renderLivePreview() {
    // 1. Sidebar live preview
    if (this.previewCanvas) {
      this.previewCanvas.width = this.targetW;
      this.previewCanvas.height = this.targetH;
      const pCtx = this.previewCanvas.getContext('2d');
      pCtx.imageSmoothingEnabled = true;
      pCtx.imageSmoothingQuality = 'medium';

      if (!this.transparent) {
        pCtx.fillStyle = this.bgColor;
        pCtx.fillRect(0, 0, this.targetW, this.targetH);
      } else {
        pCtx.clearRect(0, 0, this.targetW, this.targetH);
      }

      if (this.currentStep === 1) {
        const { x, y, w, h } = this.crop;
        pCtx.drawImage(this.sourceCanvas, x, y, w, h, 0, 0, this.targetW, this.targetH);
      } else if (this.currentStep === 2) {
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
      } else {
        const comp = this.getCompositedStep3Canvas();
        pCtx.drawImage(comp, 0, 0, this.targetW, this.targetH);
      }
    }

    // 2. Fullscreen topbar live preview thumbnail
    const fsPreview = this.overlayEl?.querySelector('#editorFsLivePreviewCanvas');
    if (fsPreview && this.currentStep === 3) {
      fsPreview.width = this.targetW;
      fsPreview.height = this.targetH;
      const fCtx = fsPreview.getContext('2d');
      fCtx.imageSmoothingEnabled = true;
      fCtx.imageSmoothingQuality = 'medium';

      if (!this.transparent) {
        fCtx.fillStyle = this.bgColor;
        fCtx.fillRect(0, 0, this.targetW, this.targetH);
      } else {
        fCtx.clearRect(0, 0, this.targetW, this.targetH);
      }

      const comp = this.getCompositedStep3Canvas();
      if (comp) fCtx.drawImage(comp, 0, 0, this.targetW, this.targetH);

      const ratioTag = this.overlayEl.querySelector('#fsPreviewRatioTag');
      if (ratioTag) ratioTag.textContent = `${this.targetW}×${this.targetH}`;
    }

    // 3. Enlarged preview modal if active
    const overlay = this.overlayEl?.querySelector('#editorPreviewModalOverlay');
    if (overlay && !overlay.classList.contains('hidden') && this.currentStep === 3) {
      this.renderEnlargedPreview();
    }
  }

  renderFinalTransformedCrop() {
    if (this.maskCanvas && (this.currentStep === 3 || this.step3BaseCanvas)) {
      const comp = this.getCompositedStep3Canvas();
      const out = createCanvas(this.targetW, this.targetH);
      const ctx = out.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (!this.transparent) {
        ctx.fillStyle = this.bgColor;
        ctx.fillRect(0, 0, this.targetW, this.targetH);
      }
      ctx.drawImage(comp, 0, 0);
      return out;
    }

    if (!this.croppedCanvas) this.commitCropToBitmap();
    const bmp = this.croppedCanvas;
    const totalDeg = this.rotation + this.straightenDeg;

    const out = createCanvas(this.targetW, this.targetH);
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

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
    ctx.drawImage(bmp, 0, 0);
    ctx.restore();

    return out;
  }

  // Pointer interactions
  onPointerDown(e) {
    // editor-pan.js owns Space+drag and Hand-tool panning exclusively.
    // If it is active, do NOT start any crop/brush/pan interaction here.
    if (window.__editorPan?.isActive()) return;

    const rect = this.editorCanvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    // Register active pointer
    this.activePointers.set(e.pointerId, {
      x: px,
      y: py,
      clientX: e.clientX,
      clientY: e.clientY,
      pointerType: e.pointerType || 'mouse'
    });

    // If within cooldown period after a pinch gesture, ignore single-pointer triggers
    if (Date.now() - this.lastPinchEndTime < this.cooldownDuration) {
      return;
    }

    // MULTI-TOUCH DETECTED: 2 or more fingers on screen
    if (this.activePointers.size >= 2) {
      // 1. Instantly rollback any accidental brush stamp created by finger 1
      if (this.currentStep === 3 && this.hadSinglePointerStamp) {
        if (this.maskSnapshotBeforeStroke && this.maskCanvas && this.maskSnapshotBeforeStroke.mask) {
          const mCtx = this.maskCanvas.getContext('2d');
          mCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
          mCtx.drawImage(this.maskSnapshotBeforeStroke.mask, 0, 0);
        }
      }

      // 2. Clear all single-pointer edit states
      this.isBrushing = false;
      this.lastBrushPoint = null;
      this.hadSinglePointerStamp = false;
      this.maskSnapshotBeforeStroke = null;
      this.brushCursor.visible = false;
      this.isDragging = false;
      this.isResizing = false;
      this.resizeHandle = null;
      this.straightenToolActive = false;
      this.straightenLineStart = null;
      this.straightenLineEnd = null;

      // 3. Activate Pinch Mode
      this.isPinching = true;
      const pointers = Array.from(this.activePointers.values());
      const p1 = pointers[0];
      const p2 = pointers[1];
      const dist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      const mid = {
        x: (p1.clientX + p2.clientX) / 2,
        y: (p1.clientY + p2.clientY) / 2
      };

      if (this.currentStep === 3) {
        this.pinchStart = {
          dist: Math.max(10, dist),
          mid,
          zoom: this.step3Zoom || 1.0,
          panX: this.step3PanX || 0,
          panY: this.step3PanY || 0
        };
      } else if (this.currentStep === 2) {
        this.pinchStart = {
          dist: Math.max(10, dist),
          mid,
          zoom: this.step2Zoom || 1.0,
          panX: this.step2PanX || 0,
          panY: this.step2PanY || 0
        };
      } else {
        // Step 1: Crop Frame
        this.pinchStart = {
          dist: Math.max(10, dist),
          mid,
          crop: { ...this.crop }
        };
      }

      try {
        this.editorCanvas.setPointerCapture(e.pointerId);
      } catch (_) {}
      this.requestRender();
      return;
    }

    // SINGLE POINTER INTERACTION (1 finger or mouse):
    if (this.currentStep === 1) {
      const scale = this.displayScale;
      const cropScreenX = this.displayOffsetX + this.crop.x * scale;
      const cropScreenY = this.displayOffsetY + this.crop.y * scale;
      const cropScreenW = this.crop.w * scale;
      const cropScreenH = this.crop.h * scale;

      // Generous 32px touch target on touch screens for easy corner/edge grabbing
      const handleThreshold = (e.pointerType === 'touch' || 'ontouchstart' in window) ? 32 : 22;
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
          try { this.editorCanvas.setPointerCapture(e.pointerId); } catch (_) {}
          return;
        }
      }

      if (px >= cropScreenX && px <= cropScreenX + cropScreenW &&
          py >= cropScreenY && py <= cropScreenY + cropScreenH) {
        this.isDragging = true;
        this.dragStart = { x: px, y: py };
        this.cropStart = { ...this.crop };
        try { this.editorCanvas.setPointerCapture(e.pointerId); } catch (_) {}
      }
    } else if (this.currentStep === 2) {
      if (this.straightenToolActive) {
        this.straightenLineStart = { x: px, y: py };
        this.straightenLineEnd = { x: px, y: py };
        try { this.editorCanvas.setPointerCapture(e.pointerId); } catch (_) {}
      } else {
        this.isDragging = true;
        this.dragStart = { x: px, y: py };
        this.panStart = { x: this.step2PanX, y: this.step2PanY };
        try { this.editorCanvas.setPointerCapture(e.pointerId); } catch (_) {}
      }
    } else if (this.currentStep === 3) {
      if (this.maskCanvas) {
        this.maskSnapshotBeforeStroke = this.createMaskSnapshot();
      }
      this.strokeHasModified = false;
      this.isBrushing = true;
      this.hadSinglePointerStamp = true;
      this.brushCursor.x = px;
      this.brushCursor.y = py;
      this.brushCursor.visible = true;

      const screenW = this.targetW * this.displayScale;
      const screenH = this.targetH * this.displayScale;
      const screenX = this.displayOffsetX - screenW / 2;
      const screenY = this.displayOffsetY - screenH / 2;

      const imgX = (px - screenX) / this.displayScale;
      const imgY = (py - screenY) / this.displayScale;

      this.lastBrushPoint = { x: imgX, y: imgY };
      this.applyBrushStamp(imgX, imgY);
      this.strokeHasModified = true;
      try { this.editorCanvas.setPointerCapture(e.pointerId); } catch (_) {}
      this.requestRender();
    }
  }

  onPointerMove(e) {
    // editor-pan.js handles all movement while panning — skip our own move logic.
    if (window.__editorPan?.isPanning()) return;

    const rect = this.editorCanvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (this.activePointers.has(e.pointerId)) {
      this.activePointers.set(e.pointerId, {
        x: px,
        y: py,
        clientX: e.clientX,
        clientY: e.clientY,
        pointerType: e.pointerType || 'mouse'
      });
    }

    // MULTI-TOUCH / PINCH ACTIVE:
    if (this.isPinching || this.activePointers.size >= 2) {
      this.isBrushing = false;
      this.brushCursor.visible = false;
      this.hadSinglePointerStamp = false;

      if (this.activePointers.size >= 2 && this.pinchStart) {
        const pointers = Array.from(this.activePointers.values());
        const p1 = pointers[0];
        const p2 = pointers[1];
        const currentDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
        const scaleRatio = currentDist / Math.max(10, this.pinchStart.dist);
        const mid = {
          x: (p1.clientX + p2.clientX) / 2,
          y: (p1.clientY + p2.clientY) / 2
        };
        const deltaX = mid.x - this.pinchStart.mid.x;
        const deltaY = mid.y - this.pinchStart.mid.y;

        if (this.currentStep === 3) {
          const newZoom = Math.min(8.0, Math.max(0.25, this.pinchStart.zoom * scaleRatio));
          this.step3Zoom = newZoom;
          this.step3PanX = this.pinchStart.panX + deltaX;
          this.step3PanY = this.pinchStart.panY + deltaY;
          this.requestRender();
        } else if (this.currentStep === 2) {
          const newZoom = Math.min(16.0, Math.max(0.1, this.pinchStart.zoom * scaleRatio));
          this.step2Zoom = Math.round(newZoom * 100) / 100;
          const zoomSlider = this.overlayEl.querySelector('#editorZoomSlider');
          if (zoomSlider) zoomSlider.value = this.step2Zoom;
          this.updateZoomInputDisplay();

          const baseScale = this.displayScale || 1;
          this.step2PanX = this.pinchStart.panX + (deltaX / baseScale);
          this.step2PanY = this.pinchStart.panY + (deltaY / baseScale);
          this.requestRender();
        } else if (this.currentStep === 1) {
          // Step 1: Smooth crop frame scaling and 2-finger pan
          const targetAspect = this.targetW / this.targetH;
          const baseCropW = this.pinchStart.crop.w;
          let newW = baseCropW * scaleRatio;
          let newH = newW / targetAspect;
          const maxW = this.sourceCanvas.width;
          const maxH = this.sourceCanvas.height;

          if (newW > maxW) {
            newW = maxW;
            newH = newW / targetAspect;
          }
          if (newH > maxH) {
            newH = maxH;
            newW = newH * targetAspect;
          }
          newW = Math.max(20, newW);
          newH = Math.max(20, newH);

          const origCx = this.pinchStart.crop.x + this.pinchStart.crop.w / 2;
          const origCy = this.pinchStart.crop.y + this.pinchStart.crop.h / 2;
          const baseScale = this.displayScale || 1;
          const newCx = origCx + (deltaX / baseScale);
          const newCy = origCy + (deltaY / baseScale);

          this.crop.w = Math.round(newW);
          this.crop.h = Math.round(newH);
          this.crop.x = Math.round(newCx - newW / 2);
          this.crop.y = Math.round(newCy - newH / 2);
          this.clampCropToBounds();
          this.requestRender();
        }
      }
      return;
    }

    // Cooldown check: ignore lingering move events from remaining finger right after pinch ends
    if (Date.now() - this.lastPinchEndTime < this.cooldownDuration) {
      return;
    }

    if (this.currentStep === 1) {
      if (!this.isDragging && !this.isResizing) {
        const scale = this.displayScale;
        const cropScreenX = this.displayOffsetX + this.crop.x * scale;
        const cropScreenY = this.displayOffsetY + this.crop.y * scale;
        const cropScreenW = this.crop.w * scale;
        const cropScreenH = this.crop.h * scale;

        const HIT = 14;
        const handles = [
          { name: 'nwse-resize', x: cropScreenX, y: cropScreenY },
          { name: 'nesw-resize', x: cropScreenX + cropScreenW, y: cropScreenY },
          { name: 'nesw-resize', x: cropScreenX, y: cropScreenY + cropScreenH },
          { name: 'nwse-resize', x: cropScreenX + cropScreenW, y: cropScreenY + cropScreenH },
          { name: 'ns-resize', x: cropScreenX + cropScreenW / 2, y: cropScreenY },
          { name: 'ns-resize', x: cropScreenX + cropScreenW / 2, y: cropScreenY + cropScreenH },
          { name: 'ew-resize', x: cropScreenX, y: cropScreenY + cropScreenH / 2 },
          { name: 'ew-resize', x: cropScreenX + cropScreenW, y: cropScreenY + cropScreenH / 2 }
        ];

        let cursor = 'crosshair';
        for (const h of handles) {
          if (Math.abs(px - h.x) <= HIT && Math.abs(py - h.y) <= HIT) {
            cursor = h.name;
            break;
          }
        }
        if (cursor === 'crosshair' && px > cropScreenX && px < cropScreenX + cropScreenW && py > cropScreenY && py < cropScreenY + cropScreenH) {
          cursor = 'move';
        }
        this.editorCanvas.style.cursor = cursor;
        return;
      }
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
    } else if (this.currentStep === 2) {
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
    } else if (this.currentStep === 3) {
      this.brushCursor.x = px;
      this.brushCursor.y = py;
      this.brushCursor.visible = (px >= 0 && px <= rect.width && py >= 0 && py <= rect.height);

      if (this.isBrushing && this.lastBrushPoint) {
        const screenW = this.targetW * this.displayScale;
        const screenH = this.targetH * this.displayScale;
        const screenX = this.displayOffsetX - screenW / 2;
        const screenY = this.displayOffsetY - screenH / 2;

        const imgX = (px - screenX) / this.displayScale;
        const imgY = (py - screenY) / this.displayScale;

        this.applyBrushStroke(this.lastBrushPoint.x, this.lastBrushPoint.y, imgX, imgY);
        this.strokeHasModified = true;
        this.lastBrushPoint = { x: imgX, y: imgY };
      }
      this.requestRender();
    }
  }

  onPointerUp(e) {
    this.activePointers.delete(e.pointerId);

    try {
      this.editorCanvas.releasePointerCapture(e.pointerId);
    } catch (_) {}

    if (this.isPinching) {
      if (this.activePointers.size < 2) {
        this.isPinching = false;
        this.lastPinchEndTime = Date.now();
        this.pinchStart = null;
        this.isBrushing = false;
        this.strokeHasModified = false;
        this.lastBrushPoint = null;
        this.hadSinglePointerStamp = false;
        this.maskSnapshotBeforeStroke = null;
        this.isDragging = false;
        this.isResizing = false;
        if (this.currentStep === 2) {
          this.pushHistory();
        }
        this.requestRender();
      }
      return;
    }

    if (Date.now() - this.lastPinchEndTime < this.cooldownDuration) {
      this.isBrushing = false;
      this.strokeHasModified = false;
      this.lastBrushPoint = null;
      this.hadSinglePointerStamp = false;
      this.maskSnapshotBeforeStroke = null;
      this.isDragging = false;
      this.isResizing = false;
      return;
    }

    if (this.currentStep === 2 && this.straightenToolActive && this.straightenLineStart && this.straightenLineEnd) {
      const dx = this.straightenLineEnd.x - this.straightenLineStart.x;
      const dy = this.straightenLineEnd.y - this.straightenLineStart.y;
      if (Math.hypot(dx, dy) > 10) {
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
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
    } else if (this.currentStep === 3) {
      if (this.isBrushing && this.strokeHasModified && this.maskSnapshotBeforeStroke) {
        this.pushMaskHistory(this.maskSnapshotBeforeStroke);
      }
      this.isBrushing = false;
      this.strokeHasModified = false;
      this.lastBrushPoint = null;
      this.hadSinglePointerStamp = false;
      this.maskSnapshotBeforeStroke = null;
      this.requestRender();
    }

    this.isDragging = false;
    this.isResizing = false;
    this.resizeHandle = null;
  }

  onPointerCancel(e) {
    this.activePointers.delete(e.pointerId);
    try {
      this.editorCanvas.releasePointerCapture(e.pointerId);
    } catch (_) {}

    if (this.isPinching) {
      if (this.activePointers.size < 2) {
        this.isPinching = false;
        this.lastPinchEndTime = Date.now();
        this.pinchStart = null;
      }
    }

    this.isBrushing = false;
    this.lastBrushPoint = null;
    this.hadSinglePointerStamp = false;
    this.maskSnapshotBeforeStroke = null;
    this.brushCursor.visible = false;
    this.isDragging = false;
    this.isResizing = false;
    this.resizeHandle = null;
    this.straightenToolActive = false;
    this.straightenLineStart = null;
    this.straightenLineEnd = null;
    this.requestRender();
  }

  onWheel(e) {
    e.preventDefault();
    if (this.currentStep === 1) {
      // Scroll UP (deltaY < 0) -> enlarge crop frame; Scroll DOWN (deltaY > 0) -> shrink crop frame
      const scaleFactor = e.deltaY < 0 ? 1.08 : 0.92;
      const targetAspect = this.targetW / this.targetH;
      const minW = Math.max(16, 16 * targetAspect);
      const minH = Math.max(16, 16 / targetAspect);
      const maxW = this.sourceCanvas.width;
      const maxH = this.sourceCanvas.height;

      let newW = this.crop.w * scaleFactor;
      let newH = this.crop.h * scaleFactor;

      if (targetAspect >= 1) {
        if (newW > maxW) {
          newW = maxW;
          newH = newW / targetAspect;
        }
        if (newH > maxH) {
          newH = maxH;
          newW = newH * targetAspect;
        }
      } else {
        if (newH > maxH) {
          newH = maxH;
          newW = newH * targetAspect;
        }
        if (newW > maxW) {
          newW = maxW;
          newH = newW / targetAspect;
        }
      }

      if (newW < minW || newH < minH) {
        newW = Math.max(minW, minH * targetAspect);
        newH = newW / targetAspect;
      }

      const cx = this.crop.x + this.crop.w / 2;
      const cy = this.crop.y + this.crop.h / 2;
      this.crop.w = Math.round(newW);
      this.crop.h = Math.round(newH);
      this.crop.x = Math.round(cx - newW / 2);
      this.crop.y = Math.round(cy - newH / 2);
      this.clampCropToBounds();
      this.requestRender();
    } else if (this.currentStep === 2) {
      const zoomDelta = e.deltaY < 0 ? 0.05 : -0.05;
      const newZoom = Math.max(0.1, Math.min(16.0, Math.round((this.step2Zoom + zoomDelta) * 100) / 100));
      this.step2Zoom = newZoom;
      this.overlayEl.querySelector('#editorZoomSlider').value = newZoom;
      this.updateZoomInputDisplay();
      this.requestRender();
    } else if (this.currentStep === 3) {
      if (e.altKey || e.ctrlKey || e.metaKey) {
        // Alt + Scroll (or Ctrl+Scroll) → Zoom in/out the image in background and brush tab
        const zoomDelta = e.deltaY < 0 ? 0.15 : -0.15;
        const oldZoom = this.step3Zoom || 1.0;
        const newZoom = Math.max(0.2, Math.min(16.0, Math.round((oldZoom + zoomDelta) * 100) / 100));
        if (newZoom !== oldZoom) {
          const rect = this.editorCanvas.getBoundingClientRect();
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const cw = this.editorCanvas.width / dpr;
          const ch = this.editorCanvas.height / dpr;
          const px = e.clientX - rect.left;
          const py = e.clientY - rect.top;
          const ratio = newZoom / oldZoom;
          this.step3PanX = (this.step3PanX - (px - cw / 2)) * ratio + (px - cw / 2);
          this.step3PanY = (this.step3PanY - (py - ch / 2)) * ratio + (py - ch / 2);
          this.step3Zoom = newZoom;
          this.requestRender();
        }
      } else if (e.shiftKey) {
        // Shift + Scroll → Hardness (±5%)
        const delta = e.deltaY < 0 ? 5 : -5;
        this.brushHardness = Math.max(0, Math.min(100, this.brushHardness + delta));
        this.overlayEl.querySelector('#brushHardnessSlider').value = this.brushHardness;
        this.updateBrushHardnessInputDisplay();
        this.requestRender();
      } else {
        // Scroll → Brush Size (±5px)
        const delta = e.deltaY < 0 ? 5 : -5;
        this.brushSize = Math.max(5, Math.min(150, this.brushSize + delta));
        this.overlayEl.querySelector('#brushSizeSlider').value = this.brushSize;
        this.updateBrushSizeInputDisplay();
        this.requestRender();
      }
    }
  }
}
