// js/editor.js - Manual Crop, Straighten, Pan, Zoom, and Rotation editor
import { createCanvas, stepDownDownscale } from './loader.js';

export class ManualEditor {
  constructor(options = {}) {
    this.container = options.container;
    this.sourceCanvas = null;
    this.targetW = 300;
    this.targetH = 300;
    this.preset = null;
    this.onApply = options.onApply || (() => {});
    this.onLiveUpdate = options.onLiveUpdate || (() => {});

    // State
    this.crop = { x: 0, y: 0, w: 100, h: 100 };
    this.zoom = 1.0;
    this.rotation = 0; // -90, 0, 90, 180, 270
    this.straightenDeg = 0; // -20..+20
    this.flipH = false;
    this.flipV = false;
    this.allowPadding = false;
    this.bgColor = '#ffffff';
    this.transparent = false;

    // Interaction tracking
    this.isDragging = false;
    this.isResizing = false;
    this.resizeHandle = null;
    this.dragStart = { x: 0, y: 0 };
    this.cropStart = { x: 0, y: 0, w: 0, h: 0 };

    this.editorCanvas = null;
    this.previewCanvas = null;
    this.workingTransformedCanvas = null;

    this.initDOM();
  }

  initDOM() {
    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'editor-modal-overlay hidden';
    this.overlayEl.innerHTML = `
      <div class="editor-modal-dialog">
        <div class="editor-header">
          <h3 class="editor-title" data-i18n="editorTitle">Manual Crop & Straighten</h3>
          <button class="editor-close-btn" id="editorCancelBtn" aria-label="Close">&times;</button>
        </div>
        <div class="editor-body">
          <div class="editor-viewport-container">
            <canvas id="editorInteractiveCanvas" class="editor-interactive-canvas"></canvas>
            <div class="editor-help-text">Drag frame to move · Drag corners or scroll to zoom</div>
          </div>
          <div class="editor-sidebar">
            <div class="editor-preview-box">
              <label class="editor-label" data-i18n="after">Exact Output Preview</label>
              <div class="editor-preview-wrapper">
                <canvas id="editorLivePreviewCanvas" class="editor-live-preview"></canvas>
              </div>
              <div class="editor-dim-text" id="editorDimText">300×300 px</div>
            </div>

            <div class="editor-tools">
              <!-- Straighten Slider -->
              <div class="editor-control-group">
                <div class="editor-control-header">
                  <span data-i18n="straighten">Straighten Slider</span>
                  <span id="straightenValText">0.0°</span>
                </div>
                <input type="range" id="straightenSlider" min="-20" max="20" step="0.2" value="0" class="editor-slider">
              </div>

              <!-- Zoom Slider -->
              <div class="editor-control-group">
                <div class="editor-control-header">
                  <span data-i18n="zoom">Zoom</span>
                  <span id="zoomValText">100%</span>
                </div>
                <input type="range" id="editorZoomSlider" min="0.5" max="3.0" step="0.05" value="1.0" class="editor-slider">
              </div>

              <!-- Transforms Buttons -->
              <div class="editor-btn-row">
                <button type="button" class="btn btn-secondary btn-sm" id="btnRotLeft" title="Rotate -90°">↺ -90°</button>
                <button type="button" class="btn btn-secondary btn-sm" id="btnRotRight" title="Rotate +90°">↻ +90°</button>
                <button type="button" class="btn btn-secondary btn-sm" id="btnFlipH" title="Flip Horizontal">⇆ Flip H</button>
                <button type="button" class="btn btn-secondary btn-sm" id="btnFlipV" title="Flip Vertical">⇅ Flip V</button>
              </div>

              <!-- Options -->
              <div class="editor-options-row">
                <label class="editor-checkbox-label">
                  <input type="checkbox" id="allowPaddingCheck">
                  <span data-i18n="allowPadding">Allow padding outside image</span>
                </label>
              </div>

              <div class="editor-actions-row">
                <button type="button" class="btn btn-outline" id="btnResetAuto" data-i18n="resetCrop">Reset to Auto</button>
                <button type="button" class="btn btn-primary" id="btnApplyEditor" data-i18n="applyChanges">Apply & Close</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlayEl);

    this.editorCanvas = this.overlayEl.querySelector('#editorInteractiveCanvas');
    this.previewCanvas = this.overlayEl.querySelector('#editorLivePreviewCanvas');
    this.attachEventListeners();
  }

  attachEventListeners() {
    const el = this.overlayEl;
    el.querySelector('#editorCancelBtn').addEventListener('click', () => this.close());
    el.querySelector('#btnApplyEditor').addEventListener('click', () => this.apply());
    el.querySelector('#btnResetAuto').addEventListener('click', () => this.resetToAuto());

    // Rotation & Flip
    el.querySelector('#btnRotLeft').addEventListener('click', () => {
      this.rotation = (this.rotation - 90 + 360) % 360;
      this.rebuildTransformedWorkingCanvas();
      this.resetCropToCenter();
      this.redraw();
    });

    el.querySelector('#btnRotRight').addEventListener('click', () => {
      this.rotation = (this.rotation + 90) % 360;
      this.rebuildTransformedWorkingCanvas();
      this.resetCropToCenter();
      this.redraw();
    });

    el.querySelector('#btnFlipH').addEventListener('click', () => {
      this.flipH = !this.flipH;
      this.rebuildTransformedWorkingCanvas();
      this.redraw();
    });

    el.querySelector('#btnFlipV').addEventListener('click', () => {
      this.flipV = !this.flipV;
      this.rebuildTransformedWorkingCanvas();
      this.redraw();
    });

    // Straighten Slider
    const strSlider = el.querySelector('#straightenSlider');
    const strText = el.querySelector('#straightenValText');
    strSlider.addEventListener('input', (e) => {
      this.straightenDeg = parseFloat(e.target.value) || 0;
      strText.textContent = `${this.straightenDeg.toFixed(1)}°`;
      this.rebuildTransformedWorkingCanvas();
      this.redraw();
    });

    // Zoom Slider
    const zoomSlider = el.querySelector('#editorZoomSlider');
    const zoomText = el.querySelector('#zoomValText');
    zoomSlider.addEventListener('input', (e) => {
      const z = parseFloat(e.target.value) || 1;
      this.setZoom(z);
      zoomText.textContent = `${Math.round(z * 100)}%`;
    });

    // Allow padding checkbox
    const padCheck = el.querySelector('#allowPaddingCheck');
    padCheck.addEventListener('change', (e) => {
      this.allowPadding = e.target.checked;
      this.clampCropToBounds();
      this.redraw();
    });

    // Pointer Events on Interactive Canvas
    this.editorCanvas.style.touchAction = 'none';
    this.editorCanvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.editorCanvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
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
    this.flipH = options.flipH || false;
    this.flipV = options.flipV || false;
    this.allowPadding = options.allowPadding || false;

    this.overlayEl.querySelector('#allowPaddingCheck').checked = this.allowPadding;
    this.overlayEl.querySelector('#straightenSlider').value = this.straightenDeg;
    this.overlayEl.querySelector('#straightenValText').textContent = `${this.straightenDeg.toFixed(1)}°`;
    this.overlayEl.querySelector('#editorDimText').textContent = `${targetW}×${targetH} px`;

    this.rebuildTransformedWorkingCanvas();

    if (initialCrop) {
      this.crop = { ...initialCrop };
    } else {
      this.resetCropToCenter();
    }

    this.overlayEl.classList.remove('hidden');
    this.resizeEditorCanvas();
    this.redraw();
  }

  close() {
    this.overlayEl.classList.add('hidden');
  }

  apply() {
    this.close();
    this.onApply({
      crop: this.crop,
      rotation: this.rotation,
      straightenDeg: this.straightenDeg,
      flipH: this.flipH,
      flipV: this.flipV,
      allowPadding: this.allowPadding,
      transformedCanvas: this.workingTransformedCanvas
    });
  }

  resetToAuto() {
    this.rotation = 0;
    this.straightenDeg = 0;
    this.flipH = false;
    this.flipV = false;
    this.overlayEl.querySelector('#straightenSlider').value = 0;
    this.overlayEl.querySelector('#straightenValText').textContent = '0.0°';
    this.rebuildTransformedWorkingCanvas();
    this.resetCropToCenter();
    this.redraw();
  }

  rebuildTransformedWorkingCanvas() {
    if (!this.sourceCanvas) return;
    let canvas = this.sourceCanvas;

    // 1. Straighten rotation + manual 90° rotation
    const totalDeg = this.rotation + this.straightenDeg;
    if (Math.abs(totalDeg) > 0.05) {
      const rad = (totalDeg * Math.PI) / 180;
      const sin = Math.abs(Math.sin(rad));
      const cos = Math.abs(Math.cos(rad));
      const w = canvas.width;
      const h = canvas.height;
      const nw = Math.round(w * cos + h * sin);
      const nh = Math.round(w * sin + h * cos);

      const rotCanvas = createCanvas(nw, nh);
      const ctx = rotCanvas.getContext('2d');
      ctx.fillStyle = this.bgColor;
      ctx.fillRect(0, 0, nw, nh);
      ctx.translate(nw / 2, nh / 2);
      ctx.rotate(rad);
      ctx.drawImage(canvas, -w / 2, -h / 2);
      canvas = rotCanvas;
    }

    // 2. Flip H / V
    if (this.flipH || this.flipV) {
      const flipCanvas = createCanvas(canvas.width, canvas.height);
      const ctx = flipCanvas.getContext('2d');
      ctx.translate(this.flipH ? canvas.width : 0, this.flipV ? canvas.height : 0);
      ctx.scale(this.flipH ? -1 : 1, this.flipV ? -1 : 1);
      ctx.drawImage(canvas, 0, 0);
      canvas = flipCanvas;
    }

    this.workingTransformedCanvas = canvas;
  }

  resetCropToCenter() {
    const imgW = this.workingTransformedCanvas.width;
    const imgH = this.workingTransformedCanvas.height;
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

  setZoom(zoomFactor) {
    const cx = this.crop.x + this.crop.w / 2;
    const cy = this.crop.y + this.crop.h / 2;
    const targetAspect = this.targetW / this.targetH;

    // Invert zoom so higher slider = closer in (smaller crop frame)
    const baseDim = Math.min(this.workingTransformedCanvas.width, this.workingTransformedCanvas.height) * 0.85;
    let newH = baseDim / zoomFactor;
    let newW = newH * targetAspect;

    this.crop.w = Math.round(newW);
    this.crop.h = Math.round(newH);
    this.crop.x = Math.round(cx - newW / 2);
    this.crop.y = Math.round(cy - newH / 2);

    this.clampCropToBounds();
    this.redraw();
  }

  clampCropToBounds() {
    if (this.allowPadding) return; // Can extend outside
    const imgW = this.workingTransformedCanvas.width;
    const imgH = this.workingTransformedCanvas.height;

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

  resizeEditorCanvas() {
    const container = this.editorCanvas.parentElement;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.editorCanvas.width = (rect.width || 600) * dpr;
    this.editorCanvas.height = (rect.height || 450) * dpr;
  }

  redraw() {
    if (!this.workingTransformedCanvas) return;
    const cvs = this.editorCanvas;
    const ctx = cvs.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const cw = cvs.width / dpr;
    const ch = cvs.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cw, ch);

    // Compute display scale & center offset of workingTransformedCanvas inside viewport
    const imgW = this.workingTransformedCanvas.width;
    const imgH = this.workingTransformedCanvas.height;
    const scale = Math.min((cw - 40) / imgW, (ch - 40) / imgH);
    const offsetX = (cw - imgW * scale) / 2;
    const offsetY = (ch - imgH * scale) / 2;

    this.displayScale = scale;
    this.displayOffsetX = offsetX;
    this.displayOffsetY = offsetY;

    // Draw background image
    ctx.drawImage(this.workingTransformedCanvas, offsetX, offsetY, imgW * scale, imgH * scale);

    // Dark semi-transparent mask outside crop
    const cropScreenX = offsetX + this.crop.x * scale;
    const cropScreenY = offsetY + this.crop.y * scale;
    const cropScreenW = this.crop.w * scale;
    const cropScreenH = this.crop.h * scale;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    ctx.rect(cropScreenX, cropScreenY, cropScreenW, cropScreenH);
    ctx.fill('evenodd');

    // Rule of thirds grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
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

    // Crop border
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(cropScreenX, cropScreenY, cropScreenW, cropScreenH);

    // Corner & Edge Handles
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    const handleRadius = 6;
    const corners = [
      { x: cropScreenX, y: cropScreenY },
      { x: cropScreenX + cropScreenW, y: cropScreenY },
      { x: cropScreenX, y: cropScreenY + cropScreenH },
      { x: cropScreenX + cropScreenW, y: cropScreenY + cropScreenH }
    ];

    corners.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, handleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    ctx.restore();

    this.renderLivePreview();
  }

  renderLivePreview() {
    if (!this.previewCanvas || !this.workingTransformedCanvas) return;
    this.previewCanvas.width = this.targetW;
    this.previewCanvas.height = this.targetH;
    const pCtx = this.previewCanvas.getContext('2d');
    pCtx.imageSmoothingEnabled = true;
    pCtx.imageSmoothingQuality = 'high';

    if (!this.transparent) {
      pCtx.fillStyle = this.bgColor;
      pCtx.fillRect(0, 0, this.targetW, this.targetH);
    }

    const { x, y, w, h } = this.crop;
    const srcCvs = this.workingTransformedCanvas;

    // Crop patch
    const patch = createCanvas(w, h);
    const patchCtx = patch.getContext('2d');
    if (!this.transparent) {
      patchCtx.fillStyle = this.bgColor;
      patchCtx.fillRect(0, 0, w, h);
    }
    patchCtx.drawImage(srcCvs, x, y, w, h, 0, 0, w, h);

    const downscaled = (w > this.targetW * 1.5 || h > this.targetH * 1.5)
      ? stepDownDownscale(patch, this.targetW, this.targetH)
      : patch;

    pCtx.drawImage(downscaled, 0, 0, this.targetW, this.targetH);
  }

  // Pointer interactions
  onPointerDown(e) {
    const rect = this.editorCanvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const scale = this.displayScale;
    const cropScreenX = this.displayOffsetX + this.crop.x * scale;
    const cropScreenY = this.displayOffsetY + this.crop.y * scale;
    const cropScreenW = this.crop.w * scale;
    const cropScreenH = this.crop.h * scale;

    // Check corner handles
    const handleThreshold = 18;
    const handles = [
      { name: 'tl', x: cropScreenX, y: cropScreenY },
      { name: 'tr', x: cropScreenX + cropScreenW, y: cropScreenY },
      { name: 'bl', x: cropScreenX, y: cropScreenY + cropScreenH },
      { name: 'br', x: cropScreenX + cropScreenW, y: cropScreenY + cropScreenH }
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

    // Check inside crop frame
    if (px >= cropScreenX && px <= cropScreenX + cropScreenW &&
        py >= cropScreenY && py <= cropScreenY + cropScreenH) {
      this.isDragging = true;
      this.dragStart = { x: px, y: py };
      this.cropStart = { ...this.crop };
      this.editorCanvas.setPointerCapture(e.pointerId);
    }
  }

  onPointerMove(e) {
    if (!this.isDragging && !this.isResizing) return;
    const rect = this.editorCanvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const dx = (px - this.dragStart.x) / this.displayScale;
    const dy = (py - this.dragStart.y) / this.displayScale;

    if (this.isDragging) {
      this.crop.x = Math.round(this.cropStart.x + dx);
      this.crop.y = Math.round(this.cropStart.y + dy);
      this.clampCropToBounds();
      this.redraw();
      return;
    }

    if (this.isResizing) {
      const targetAspect = this.targetW / this.targetH;
      let deltaH = 0;
      if (this.resizeHandle === 'br' || this.resizeHandle === 'bl') {
        deltaH = dy;
      } else {
        deltaH = -dy;
      }

      let newH = Math.max(20, this.cropStart.h + deltaH);
      let newW = Math.round(newH * targetAspect);

      const cx = this.cropStart.x + this.cropStart.w / 2;
      const cy = this.cropStart.y + this.cropStart.h / 2;

      this.crop.w = newW;
      this.crop.h = newH;
      this.crop.x = Math.round(cx - newW / 2);
      this.crop.y = Math.round(cy - newH / 2);

      this.clampCropToBounds();
      this.redraw();
    }
  }

  onPointerUp(e) {
    this.isDragging = false;
    this.isResizing = false;
    this.resizeHandle = null;
    try {
      this.editorCanvas.releasePointerCapture(e.pointerId);
    } catch (err) {}
  }

  onWheel(e) {
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 0.05 : -0.05;
    const newZoom = Math.max(0.4, Math.min(3.5, this.zoom + zoomDelta));
    this.zoom = newZoom;
    this.setZoom(newZoom);
    const slider = this.overlayEl.querySelector('#editorZoomSlider');
    if (slider) slider.value = newZoom;
    const zoomText = this.overlayEl.querySelector('#zoomValText');
    if (zoomText) zoomText.textContent = `${Math.round(newZoom * 100)}%`;
  }
}
