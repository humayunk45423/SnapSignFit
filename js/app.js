// js/app.js - Main Application Orchestrator, UI Events, and Auto-Processing Pipeline
import { CONFIG, t, initLanguage, setLanguage, getLanguage, updateDOMTranslations, formatLocalizedNumber } from './i18n.js';
import { PRESETS, getSavedCustomPresets, saveCustomPreset, unitToPixels } from './presets.js';
import { loadImageFile, createCanvas, flattenAlpha } from './loader.js';
import { detectFacesWithLadder, selectPrimaryFace, computePassportCrop, checkFaceQuality, rotateCanvas } from './face.js';
import { calculateEyeTilt, rotateWithEdgeReplication, autoEnhanceCanvas, detectSignaturePaperTilt } from './orient.js';
import { processSignature } from './signature.js';
import { computeSaliencyCrop, computeFaceAwareCrop, renderFitMode } from './smartcrop.js';
import { ManualEditor } from './editor.js';
import { exportWithGuarantee, triggerDownload, copyToClipboard } from './export.js';
import { removeBackgroundToWhite } from './bg.js';
import { saveSessionCanvas, loadSessionCanvas, removeSessionCanvas, clearSession, saveSessionState, loadSessionState } from './session.js';
import { icon } from './icons.js';

class SnapSignFitApp {
  constructor() {
    // Pipeline State
    this.sourceData = null; // { fullCanvas, workingCanvas, workingScale, fileName }
    this.hasDownloadedCurrentWork = false;
    this.currentPreset = PRESETS[0]; // Default: Photo 300x300
    this.currentCategory = 'gov';
    
    // Auto-fix tracking & undos
    this.autoFixes = {
      rotationDeg: 0,
      tiltDeg: 0,
      enhanced: false
    };
    this.activeWarnings = [];
    this.activeChips = []; // { id, label, isUndoable, onUndo }
    
    // User settings
    this.userTransforms = {
      crop: null,
      rotation: 0,
      straightenDeg: 0,
      flipH: false,
      flipV: false,
      allowPadding: false
    };
    this.customOptions = {
      format: 'jpg',
      maxKB: 99,
      fit: 'cover',
      bgMode: 'keep',
      thickenPx: 0,
      keepInkColor: false,
      autoDetect: true,
      zoom2x: false
    };

    // Export result cache
    this.currentExport = null;

    // Manual Editor
    this.editor = new ManualEditor({
      onApply: (state) => this.onManualEditorApply(state)
    });

    this.init();
  }

  init() {
    initLanguage();
    this.initTheme();
    this.setupGlobalErrors();
    this.renderPresetsGrid();
    this.renderHeroChips();
    this.renderHeroSubtext();
    this.attachDOMEvents();
    this.applyPreset(PRESETS[0]);
    this.updateHeroCardTab('photo');

    this.restoreSession(); // Restore previous session after DOM is ready

    if (typeof ResizeObserver !== 'undefined') {
      const beforeVp = document.getElementById('beforeViewport');
      if (beforeVp) {
        const ro = new ResizeObserver(() => {
          if (this.lastBeforeState && this.lastBeforeState.sourceCanvas) {
            this.drawBeforeCanvas(
              this.lastBeforeState.sourceCanvas,
              this.lastBeforeState.faceBox,
              this.lastBeforeState.cropRect,
              this.lastBeforeState.kind
            );
          }
        });
        ro.observe(beforeVp);
      }
    }
  }

  setupGlobalErrors() {
    const banner = document.getElementById('globalBanner');
    const bannerText = document.getElementById('globalBannerText');
    const bannerBtn = document.getElementById('bannerManualBtn');

    const showError = (msg) => {
      console.error('Handled application error:', msg);
      if (banner && bannerText) {
        bannerText.textContent = msg || 'An unexpected issue occurred. Try manual editing mode.';
        banner.classList.remove('hidden');
      }
    };

    window.addEventListener('error', (e) => {
      showError(e.message);
    });
    window.addEventListener('unhandledrejection', (e) => {
      showError(e.reason?.message || 'Async processing error');
    });

    if (bannerBtn) {
      bannerBtn.addEventListener('click', () => {
        banner.classList.add('hidden');
        this.openManualEditor();
      });
    }
  }

  initTheme() {
    let savedTheme = null;
    try {
      savedTheme = localStorage.getItem('snapsignfit_theme');
    } catch (e) {}

    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
      this.updateThemeButtonIcon(savedTheme);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.updateThemeButtonIcon(prefersDark ? 'dark' : 'light');
    }
  }

  updateThemeButtonIcon(theme) {
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = theme === 'dark' ? 'Light' : 'Dark';
  }

  toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const newTheme = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    try {
      localStorage.setItem('snapsignfit_theme', newTheme);
    } catch (e) {}
    this.updateThemeButtonIcon(newTheme);
  }

  attachDOMEvents() {
    // Language & Theme
    document.getElementById('langToggleBtn').addEventListener('click', () => {
      const newLang = getLanguage() === 'en' ? 'bn' : 'en';
      setLanguage(newLang);
      this.renderPresetsGrid();
      this.renderHeroChips();
      this.renderHeroSubtext();
      this.updateHeroCardTab(this.currentPreset?.kind || 'photo');
      this.updateStatusReadout();
    });

    document.getElementById('themeToggleBtn').addEventListener('click', () => this.toggleTheme());

    // Hero Actions (REDESIGN.md)
    const fileInput = document.getElementById('fileInput');
    const cameraInput = document.getElementById('cameraInput');
    const dropzone = document.getElementById('dropzone');

    const btnHeroPhoto = document.getElementById('btnHeroUploadPhoto');
    if (btnHeroPhoto) {
      btnHeroPhoto.addEventListener('click', () => {
        const photoPreset = PRESETS.find(p => p.category === 'gov' && p.kind === 'photo') || PRESETS[0];
        this.applyPreset(photoPreset);
        this.updateHeroCardTab('photo');
        fileInput.click();
      });
    }

    const btnHeroSig = document.getElementById('btnHeroUploadSig');
    if (btnHeroSig) {
      btnHeroSig.addEventListener('click', () => {
        const sigPreset = PRESETS.find(p => p.category === 'gov' && p.kind === 'signature');
        if (sigPreset) this.applyPreset(sigPreset);
        this.updateHeroCardTab('signature');
        fileInput.click();
      });
    }

    const heroTabPhoto = document.getElementById('heroTabPhoto');
    if (heroTabPhoto) {
      heroTabPhoto.addEventListener('click', () => {
        const photoPreset = PRESETS.find(p => p.category === 'gov' && p.kind === 'photo') || PRESETS[0];
        this.applyPreset(photoPreset);
        this.updateHeroCardTab('photo');
      });
    }

    const heroTabSig = document.getElementById('heroTabSig');
    if (heroTabSig) {
      heroTabSig.addEventListener('click', () => {
        const sigPreset = PRESETS.find(p => p.category === 'gov' && p.kind === 'signature');
        if (sigPreset) this.applyPreset(sigPreset);
        this.updateHeroCardTab('signature');
      });
    }

    // Nav anchor links
    document.querySelectorAll('.site-nav .nav-link').forEach(link => {
      link.addEventListener('click', () => {
        document.querySelectorAll('.site-nav .nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
      });
    });

    document.getElementById('btnChooseFile').addEventListener('click', () => fileInput.click());
    document.getElementById('btnTakePhoto').addEventListener('click', () => cameraInput.click());

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.handleFileUpload(e.target.files[0]);
      }
    });

    cameraInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.handleFileUpload(e.target.files[0]);
      }
    });

    dropzone.addEventListener('click', (e) => {
      if (!e.target.closest('button')) {
        fileInput.click();
      }
    });

    // Drag and Drop
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-active');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-active'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-active');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        this.handleFileUpload(e.dataTransfer.files[0]);
      }
    });

    // Paste from clipboard (Ctrl+V)
    window.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) this.handleFileUpload(file);
          break;
        }
      }
    });

    // Preset Category Tabs
    document.getElementById('tabGov').addEventListener('click', () => this.selectCategory('gov'));
    document.getElementById('tabSocial').addEventListener('click', () => this.selectCategory('social'));
    document.getElementById('tabCustom').addEventListener('click', () => this.selectCategory('custom'));

    // Preset Search
    const searchInput = document.getElementById('presetSearchInput');
    searchInput.addEventListener('input', (e) => this.filterPresets(e.target.value));

    // Custom Size Form
    const updateCustomPreset = () => {
      const w = parseInt(document.getElementById('customW').value) || 300;
      const h = parseInt(document.getElementById('customH').value) || 300;
      const unit = document.getElementById('customUnit').value;
      const dpi = parseInt(document.getElementById('customDpi').value) || 300;
      const kind = document.getElementById('customKind').value;
      const fit = document.getElementById('customFit').value;

      const pxW = unitToPixels(w, unit, dpi);
      const pxH = unitToPixels(h, unit, dpi);

      this.currentPreset = {
        id: 'custom_active',
        category: 'custom',
        label: `${pxW}×${pxH}`,
        w: pxW,
        h: pxH,
        kind,
        fit,
        format: this.customOptions.format,
        maxKB: this.customOptions.maxKB,
        locked: false,
        note: 'Custom dimensions'
      };

      this.resetUserTransforms();
      this.runProcessingPipeline();
    };

    ['customW', 'customH', 'customDpi', 'customKind', 'customFit'].forEach(id => {
      document.getElementById(id).addEventListener('change', updateCustomPreset);
    });

    document.getElementById('customUnit').addEventListener('change', (e) => {
      const isPixel = e.target.value === 'px';
      document.getElementById('dpiGroup').style.display = isPixel ? 'none' : 'flex';
      updateCustomPreset();
    });

    document.getElementById('btnSaveCustomPreset').addEventListener('click', () => {
      saveCustomPreset(this.currentPreset);
      alert('Custom preset saved!');
    });

    // Settings Bar Controls
    const formatSelect = document.getElementById('exportFormatSelect');
    formatSelect.addEventListener('change', (e) => {
      this.customOptions.format = e.target.value;
      this.hasDownloadedCurrentWork = false;
      this.runExportGuarantee();
    });

    const maxSizeSelect = document.getElementById('exportMaxSizeSelect');
    maxSizeSelect.addEventListener('change', (e) => {
      let val = parseInt(e.target.value);
      // Strictly enforce Gov lock
      if (this.currentPreset.locked && val > 99) {
        val = 99;
        maxSizeSelect.value = '99';
      }
      this.customOptions.maxKB = val;
      this.hasDownloadedCurrentWork = false;
      this.runExportGuarantee();
    });

    const fitSelect = document.getElementById('exportFitSelect');
    fitSelect.addEventListener('change', (e) => {
      this.customOptions.fit = e.target.value;
      this.hasDownloadedCurrentWork = false;
      this.runProcessingPipeline();
    });

    const bgModeSelect = document.getElementById('exportBgModeSelect');
    if (bgModeSelect) {
      bgModeSelect.addEventListener('change', (e) => {
        this.customOptions.bgMode = e.target.value;
        this.hasDownloadedCurrentWork = false;
        this.runProcessingPipeline();
      });
    }

    const thickenSlider = document.getElementById('sigThickenSlider');
    thickenSlider.addEventListener('input', (e) => {
      this.customOptions.thickenPx = parseInt(e.target.value) || 0;
      this.hasDownloadedCurrentWork = false;
      this.runProcessingPipeline();
    });

    const keepColorCheck = document.getElementById('sigKeepColorCheck');
    keepColorCheck.addEventListener('change', (e) => {
      this.customOptions.keepInkColor = e.target.checked;
      this.hasDownloadedCurrentWork = false;
      this.runProcessingPipeline();
    });

    const autoDetectCheck = document.getElementById('autoDetectCheck');
    autoDetectCheck.addEventListener('change', (e) => {
      this.customOptions.autoDetect = e.target.checked;
      this.hasDownloadedCurrentWork = false;
      this.resetUserTransforms();
      this.runProcessingPipeline();
    });

    // Zoom Preview Toggle
    const zoomToggleBtn = document.getElementById('btnToggleZoom');
    zoomToggleBtn.addEventListener('click', () => {
      this.customOptions.zoom2x = !this.customOptions.zoom2x;
      const vp = document.getElementById('afterViewport');
      if (this.customOptions.zoom2x) {
        vp.classList.add('zoom-2x');
        zoomToggleBtn.textContent = '2× Zoomed';
      } else {
        vp.classList.remove('zoom-2x');
        zoomToggleBtn.textContent = '1× Real Pixels';
      }
    });

    // Action Buttons
    const btnDiscard = document.getElementById('btnDiscard');
    if (btnDiscard) {
      btnDiscard.addEventListener('click', () => this.handleDiscardClick());
    }

    const btnModalDownloadAndClose = document.getElementById('btnModalDownloadAndClose');
    if (btnModalDownloadAndClose) {
      btnModalDownloadAndClose.addEventListener('click', async () => {
        this.triggerDownload();
        this.closeDiscardModal();
        await this.discardAndReset();
      });
    }

    const btnModalDiscardAnyway = document.getElementById('btnModalDiscardAnyway');
    if (btnModalDiscardAnyway) {
      btnModalDiscardAnyway.addEventListener('click', async () => {
        this.closeDiscardModal();
        await this.discardAndReset();
      });
    }

    const btnModalCancel = document.getElementById('btnModalCancel');
    if (btnModalCancel) {
      btnModalCancel.addEventListener('click', () => this.closeDiscardModal());
    }

    const discardModal = document.getElementById('discardModal');
    if (discardModal) {
      discardModal.addEventListener('click', (e) => {
        if (e.target === discardModal) this.closeDiscardModal();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modal = document.getElementById('discardModal');
        if (modal && !modal.classList.contains('hidden')) {
          this.closeDiscardModal();
        }
      }
    });

    document.getElementById('btnOpenEditor').addEventListener('click', () => this.openManualEditor());
    document.getElementById('btnDownload').addEventListener('click', () => this.triggerDownload());
    document.getElementById('btnCopyClipboard').addEventListener('click', () => this.copyToClipboard());

    // Fix 0: Kill all drag/pan/wheel events on workspace preview panes
    document.querySelectorAll('.preview-pane').forEach(p => {
      ['wheel', 'dragstart', 'contextmenu', 'touchmove'].forEach(evt =>
        p.addEventListener(evt, e => e.preventDefault(), { passive: false })
      );
      p.querySelectorAll('img, canvas').forEach(i => {
        if (i.draggable !== undefined) i.draggable = false;
      });
    });
  }

  selectCategory(cat) {
    this.currentCategory = cat;
    ['tabGov', 'tabSocial', 'tabCustom'].forEach(id => {
      document.getElementById(id).classList.remove('active');
    });
    
    if (cat === 'gov') document.getElementById('tabGov').classList.add('active');
    if (cat === 'social') document.getElementById('tabSocial').classList.add('active');
    if (cat === 'custom') document.getElementById('tabCustom').classList.add('active');

    const isGov = cat === 'gov';
    document.getElementById('govNoteBanner').style.display = isGov ? 'block' : 'none';

    const isCustom = cat === 'custom';
    document.getElementById('customPanel').classList.toggle('hidden', !isCustom);
    document.getElementById('presetsGrid').classList.toggle('hidden', isCustom);
    document.getElementById('presetsSearchBar').classList.toggle('hidden', isCustom);

    if (!isCustom) {
      this.renderPresetsGrid();
    }
  }

  filterPresets(query) {
    this.renderPresetsGrid(query.trim().toLowerCase());
  }

  renderPresetsGrid(filterQuery = '') {
    const grid = document.getElementById('presetsGrid');
    grid.innerHTML = '';

    const list = PRESETS.filter(p => p.category === this.currentCategory);
    const filtered = filterQuery
      ? list.filter(p => p.label.toLowerCase().includes(filterQuery) || `${p.w}x${p.h}`.includes(filterQuery))
      : list;

    filtered.forEach(preset => {
      const card = document.createElement('div');
      card.className = `preset-card ${preset.locked ? 'card-gov' : ''} ${preset.id === this.currentPreset?.id ? 'active' : ''}`;
      card.innerHTML = `
        <div>
          <div class="preset-card-header">
            <span class="preset-card-kind">${preset.kind}</span>
            ${preset.locked ? `<span class="preset-card-badge">${t('lockedGovBadge')}</span>` : ''}
          </div>
          <div class="preset-card-title">${preset.label}</div>
          <div class="preset-card-dims">${preset.w} × ${preset.h} px</div>
        </div>
        <div class="preset-card-note">${preset.note || ''}</div>
      `;
      card.addEventListener('click', () => this.applyPreset(preset));
      grid.appendChild(card);
    });
  }

  renderHeroChips() {
    const container = document.getElementById('heroChipsContainer');
    if (!container) return;
    container.innerHTML = '';

    // Pull the first 4 Government & Exam presets
    const govPresets = PRESETS.filter(p => p.category === 'gov').slice(0, 4);
    govPresets.forEach(preset => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'hero-chip';
      const limitStr = preset.maxKB ? ` (≤${preset.maxKB}KB)` : '';
      chip.textContent = `${preset.label}${limitStr}`;
      chip.addEventListener('click', () => {
        this.applyPreset(preset);
        this.updateHeroCardTab(preset.kind);
        document.getElementById('fileInput').click();
      });
      container.appendChild(chip);
    });
  }

  renderHeroSubtext() {
    const el = document.getElementById('heroSubtext');
    if (!el) return;
    const gov = PRESETS.filter(p => p.category === 'gov');
    const p1 = gov.find(p => p.w === 300 && p.h === 300);
    const p2 = gov.find(p => p.w === 250 && p.h === 250);
    const s1 = gov.find(p => p.w === 300 && p.h === 80);
    const s2 = gov.find(p => p.w === 250 && p.h === 50);

    const lang = getLanguage();
    const isBn = lang === 'bn';
    const under = isBn ? 'এর নিচে' : 'under';
    const photo = isBn ? 'ছবি' : 'Photo';
    const sig = isBn ? 'স্বাক্ষর' : 'Signature';

    const formatItem = (kind, p, max) => {
      if (!p) return '';
      const w = isBn ? formatLocalizedNumber(p.w) : p.w;
      const h = isBn ? formatLocalizedNumber(p.h) : p.h;
      const kb = isBn ? formatLocalizedNumber(max) : max;
      return `${kind} ${w}×${h} (${isBn ? `${kb}KB-${under}` : `${under} ${kb}KB`})`;
    };

    const items = [
      formatItem(photo, p1, 100),
      formatItem(photo, p2, 100),
      formatItem(sig, s1, 60),
      formatItem(sig, s2, 60)
    ].filter(Boolean);

    el.textContent = items.join(' · ');
  }

  updateHeroCardTab(kind) {
    const tabPhoto = document.getElementById('heroTabPhoto');
    const tabSig = document.getElementById('heroTabSig');
    const dropzoneTitle = document.getElementById('dropzoneTitle');
    const heroSpecLabel = document.getElementById('heroSpecLabel');
    const heroSpecDims = document.getElementById('heroSpecDims');

    const isSig = kind === 'signature';
    if (tabPhoto && tabSig) {
      tabPhoto.classList.toggle('active', !isSig);
      tabPhoto.setAttribute('aria-selected', String(!isSig));
      tabSig.classList.toggle('active', isSig);
      tabSig.setAttribute('aria-selected', String(isSig));
    }

    if (dropzoneTitle) {
      dropzoneTitle.textContent = isSig ? t('heroDropzoneSig') : t('dropzoneTitle');
    }

    if (heroSpecLabel && heroSpecDims) {
      if (isSig) {
        heroSpecLabel.textContent = t('teletalkSigSpec');
        heroSpecDims.textContent = '300×80 px (≤60 KB)';
      } else {
        heroSpecLabel.textContent = t('bcsPhotoSpec');
        heroSpecDims.textContent = '300×300 px (≤100 KB)';
      }
    }
  }

  applyPreset(preset) {
    this.currentPreset = preset;
    this.hasDownloadedCurrentWork = false;
    this.customOptions.format = preset.format || 'jpg';
    this.customOptions.fit = preset.fit || 'cover';
    this.customOptions.maxKB = preset.maxKB || (preset.locked ? 99 : 100);
    this.updateHeroCardTab(preset.kind);

    // Sync settings bar UI
    document.getElementById('exportFormatSelect').value = this.customOptions.format;
    document.getElementById('exportFitSelect').value = this.customOptions.fit;

    // Configure Max Size Select according to Gov locked status
    const maxSizeSelect = document.getElementById('exportMaxSizeSelect');
    maxSizeSelect.innerHTML = '';

    if (preset.locked) {
      // Allowed: 50 KB, 99 KB (can only be lowered, never raised above 99 KB)
      maxSizeSelect.innerHTML = `
        <option value="50">50 KB</option>
        <option value="99" selected>99 KB (Gov locked)</option>
      `;
    } else {
      maxSizeSelect.innerHTML = `
        <option value="50">50 KB</option>
        <option value="100" selected>100 KB</option>
        <option value="200">200 KB</option>
        <option value="500">500 KB</option>
        <option value="1000">1 MB</option>
        <option value="2000">2 MB</option>
        <option value="0">No limit</option>
      `;
    }
    maxSizeSelect.value = String(this.customOptions.maxKB);

    // Show/hide signature specific options
    const isSig = preset.kind === 'signature';
    document.getElementById('sigThickenGroup').classList.toggle('hidden', !isSig);
    document.getElementById('sigKeepColorGroup').classList.toggle('hidden', !isSig);

    this.renderPresetsGrid();
    this.resetUserTransforms();

    if (this.sourceData) {
      this.runProcessingPipeline();
    }
  }

  resetUserTransforms() {
    this.userTransforms = {
      crop: null,
      rotation: 0,
      straightenDeg: 0,
      flipH: false,
      flipV: false,
      allowPadding: false,
      transformedCanvas: null,
      maskCanvas: null,
      croppedCanvas: null,
      step2Transform: null
    };
    this.autoFixes = {
      rotationDeg: 0,
      tiltDeg: 0,
      enhanced: false
    };
    this.manualEditorOpenedForFile = false;
  }

  async handleFileUpload(file) {
    this.setProcessing(true, t('processing'));
    const banner = document.getElementById('globalBanner');
    if (banner) banner.classList.add('hidden');

    try {
      this.sourceData = await loadImageFile(file);
      this.hasDownloadedCurrentWork = false;
      document.body.classList.add('has-image');
      document.querySelector('.main-content')?.classList.add('has-image');
      const ws = document.getElementById('workspaceSection');
      ws.classList.remove('hidden');
      this.resetUserTransforms();
      await this.runProcessingPipeline({ fromFileUpload: true });
      if (window.innerWidth <= 860) {
        ws.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (err) {
      console.error('Image load failed:', err);
      let msg = t('errCorrupt');
      if (err.message === 'FILE_TOO_LARGE') msg = t('errTooLarge');
      if (err.message === 'DIMENSION_TOO_SMALL') msg = t('errTooSmall');
      
      const bannerText = document.getElementById('globalBannerText');
      if (bannerText) bannerText.textContent = msg;
      banner?.classList.remove('hidden');
    } finally {
      this.setProcessing(false);
    }
  }

  setProcessing(isBusy, text = '') {
    const overlay = document.getElementById('processingOverlay');
    const pText = document.getElementById('processingText');
    const badge = document.getElementById('sizeStatusBadge');
    if (overlay) overlay.classList.toggle('hidden', !isBusy);
    if (pText && text) pText.textContent = text;
    // Hide badge while busy so assertDownload waits for fresh export
    if (badge) badge.classList.toggle('hidden', isBusy);
  }

  /**
   * Main Processing Pipeline:
   * Analyzes orientation, detects faces or signatures, applies auto-straightening,
   * performs crop math, and renders the exact-dimension canvas.
   */
  async runProcessingPipeline({ fromFileUpload = false } = {}) {
    if (!this.sourceData) return;
    this.setProcessing(true);
    this.activeWarnings = [];
    this.activeChips = [];

    // 15-second watchdog timer to guarantee controls never stay stuck (B5)
    let watchdogDone = false;
    const watchdogTimer = setTimeout(() => {
      if (!watchdogDone) {
        console.warn('Pipeline watchdog timeout fired (15s exceeded)');
        this.setProcessing(false);
      }
    }, 15000);

    try {

    const { fullCanvas, workingCanvas, workingScale } = this.sourceData;
    const { w: targetW, h: targetH, kind } = this.currentPreset;

    let activeWorking = workingCanvas;
    let activeFull = fullCanvas;
    let computedCrop = null;
    let primaryFace = null;
    let signatureResult = null;

    // Apply manual rotation if set in editor
    if (this.userTransforms.rotation !== 0) {
      const rot = rotateCanvas(activeWorking, this.userTransforms.rotation);
      activeWorking = rot.rotCanvas;
      const rotFull = rotateCanvas(activeFull, this.userTransforms.rotation);
      activeFull = rotFull.rotCanvas;
    }

    // 1. Signature Pipeline
    if (kind === 'signature') {
      signatureResult = processSignature(activeFull, targetW, targetH, {
        keepInkColor: this.customOptions.keepInkColor,
        thickenPx: this.customOptions.thickenPx,
        useFullImage: !this.customOptions.autoDetect,
        bgColor: '#ffffff'
      });

      if (!signatureResult.success) {
        this.activeWarnings.push('warnNoSignature');
        // Create a proper white canvas at exact target dimensions so export doesn't fail
        const fallbackCanvas = createCanvas(targetW, targetH);
        const fCtx = fallbackCanvas.getContext('2d');
        fCtx.fillStyle = '#ffffff';
        fCtx.fillRect(0, 0, targetW, targetH);
        this.exactCanvas = fallbackCanvas;
        computedCrop = signatureResult.bbox;

        // Draw preview canvases
        this.drawBeforeCanvas(activeFull, null, null, kind);
        this.drawAfterCanvas(this.exactCanvas);
        this.renderChips();

        // Run export guarantee on fallback canvas
        await this.runExportGuarantee();
        this.setProcessing(false);

        // Open manual editor only on preset/option changes, not on initial file load.
        // This allows the test flow: upload → click preset → editor opens.
        if (!fromFileUpload && !this.manualEditorOpenedForFile) {
          this.manualEditorOpenedForFile = true;
          this.openManualEditor();
        }
        return;
      } else {
        if (signatureResult.warnings) {
          this.activeWarnings.push(...signatureResult.warnings);
        }

        // Test signature paper tilt (§6)
        if (signatureResult.components && signatureResult.components.length > 0) {
          const paperTilt = detectSignaturePaperTilt(activeFull, signatureResult.components);
          if (paperTilt !== 0 && this.autoFixes.tiltDeg === 0) {
            this.autoFixes.tiltDeg = paperTilt;
            this.addChip({
              id: 'chip-tilt',
              label: t('chipStraightened', { deg: paperTilt }),
              isUndoable: true,
              onUndo: () => {
                this.autoFixes.tiltDeg = 0;
                this.runProcessingPipeline();
              }
            });
            activeFull = rotateWithEdgeReplication(activeFull, -paperTilt);
          }
        }

        // Test ink aspect rotation test (> 1.6)
        if (signatureResult.inkAspect > 1.6 && this.autoFixes.rotationDeg === 0) {
          this.autoFixes.rotationDeg = 90;
          this.addChip({
            id: 'chip-rot',
            label: t('chipRotated', { deg: 90 }),
            isUndoable: true,
            onUndo: () => {
              this.autoFixes.rotationDeg = 0;
              this.runProcessingPipeline();
            }
          });
          const rot = rotateCanvas(activeFull, 90);
          activeFull = rot.rotCanvas;
          // Re-process with rotated canvas
          signatureResult = processSignature(activeFull, targetW, targetH, {
            keepInkColor: this.customOptions.keepInkColor,
            thickenPx: this.customOptions.thickenPx,
            useFullImage: !this.customOptions.autoDetect,
            bgColor: '#ffffff'
          });
        }
      }

      this.exactCanvas = signatureResult.canvas;
      computedCrop = signatureResult.bbox;
    } 
    // 2. Photo / Avatar / General Image Pipeline
    else {
      let faceDetection = await detectFacesWithLadder(activeWorking, activeFull, workingScale);

      // Handle ladder rotation (§6)
      if (faceDetection.detectedAngle && faceDetection.detectedAngle !== 0) {
        const deg = faceDetection.detectedAngle;
        this.autoFixes.rotationDeg = deg;
        this.addChip({
          id: 'chip-rot',
          label: t('chipRotated', { deg }),
          isUndoable: true,
          onUndo: () => {
            this.autoFixes.rotationDeg = 0;
            this.runProcessingPipeline();
          }
        });
        const rotWork = rotateCanvas(activeWorking, deg);
        activeWorking = rotWork.rotCanvas;
        const rotFull = rotateCanvas(activeFull, deg);
        activeFull = rotFull.rotCanvas;

        // Re-detect on rotated canvas
        faceDetection = await detectFacesWithLadder(activeWorking, activeFull, workingScale);
      }

      const faces = faceDetection.faces || [];

      if (faces.length > 0) {
        const sel = selectPrimaryFace(faces, activeFull.width, activeFull.height);
        primaryFace = sel.primaryFace;

        if (sel.hasMultiple) {
          this.activeWarnings.push('warnMultiFaces');
        }

        // Eye tilt correction (§6)
        const eyeTilt = calculateEyeTilt(primaryFace.keypoints);
        if (eyeTilt !== 0 && this.autoFixes.tiltDeg === 0) {
          this.autoFixes.tiltDeg = eyeTilt;
          this.addChip({
            id: 'chip-tilt',
            label: t('chipStraightened', { deg: Math.round(eyeTilt * 10) / 10 }),
            isUndoable: true,
            onUndo: () => {
              this.autoFixes.tiltDeg = 0;
              this.runProcessingPipeline();
            }
          });
          activeFull = rotateWithEdgeReplication(activeFull, -eyeTilt);
        }

        // Auto-enhance levels (§6)
        const enh = autoEnhanceCanvas(activeFull, primaryFace.box);
        if (enh.applied && !this.autoFixes.enhanced) {
          this.autoFixes.enhanced = true;
          this.addChip({
            id: 'chip-enh',
            label: t('chipEnhanced'),
            isUndoable: true,
            onUndo: () => {
              this.autoFixes.enhanced = false;
              this.runProcessingPipeline();
            }
          });
          activeFull = enh.canvas;
        }

        // Quality check (§7)
        const qualityWarns = checkFaceQuality(primaryFace, activeFull.width, activeFull.height, activeFull);
        this.activeWarnings.push(...qualityWarns);

        // Crop Calculation
        if (kind === 'photo') {
          computedCrop = computePassportCrop(primaryFace.box, activeFull.width, activeFull.height, targetW, targetH);
        } else {
          computedCrop = computeFaceAwareCrop(faces, activeFull.width, activeFull.height, targetW, targetH, kind);
        }
      } else {
        // No face found
        if (kind === 'photo') {
          this.activeWarnings.push('warnNoFace');
          computedCrop = {
            x: Math.round((activeFull.width - Math.min(activeFull.width, activeFull.height)) / 2),
            y: 0,
            w: Math.min(activeFull.width, activeFull.height),
            h: Math.min(activeFull.width, activeFull.height)
          };
          if (!this.userTransforms.crop && !this.manualEditorOpenedForFile) {
            this.manualEditorOpenedForFile = true;
            this.openManualEditor();
          }
        } else {
          // Saliency crop (§9)
          computedCrop = computeSaliencyCrop(activeFull, targetW, targetH);
        }
      }

      // Check user override crop from manual editor
      const effectiveCrop = this.userTransforms.crop || computedCrop;

      if (this.userTransforms.transformedCanvas) {
        this.exactCanvas = this.userTransforms.transformedCanvas;
      } else {
        // Fit mode rendering
        this.exactCanvas = renderFitMode(activeFull, targetW, targetH, {
          fit: this.customOptions.fit,
          cropRect: effectiveCrop,
          bgColor: '#ffffff',
          blurredBg: false,
          transparent: this.customOptions.bgMode === 'transparent'
        });
      }

      // Background Removal / White mode handling
      if (this.customOptions.bgMode === 'remove' && kind !== 'signature') {
        const faceCenter = primaryFace ? {
          x: (primaryFace.box.x + primaryFace.box.w / 2 - (effectiveCrop?.x || 0)) / (effectiveCrop?.w || activeFull.width),
          y: (primaryFace.box.y + primaryFace.box.h / 2 - (effectiveCrop?.y || 0)) / (effectiveCrop?.h || activeFull.height)
        } : null;

        const bgRes = await removeBackgroundToWhite(this.exactCanvas, faceCenter);
        if (bgRes.skipped) {
          this.activeWarnings.push('bgSkippedToast');
        } else {
          this.exactCanvas = bgRes.canvas;
        }
      }
    }

    // Draw Before canvas with detection overlay
    this.drawBeforeCanvas(activeFull, primaryFace?.box, computedCrop, kind);

    // Draw After canvas
    this.drawAfterCanvas(this.exactCanvas);

    // Render chips
    this.renderChips();

    // Run export guarantee ladder
    await this.runExportGuarantee();
    } catch (err) {
      console.error('Pipeline execution error:', err);
    } finally {
      watchdogDone = true;
      clearTimeout(watchdogTimer);
      this.setProcessing(false);
    }
  }

  drawBeforeCanvas(sourceCanvas, faceBox, cropRect, kind) {
    this.lastBeforeState = { sourceCanvas, faceBox, cropRect, kind };
    const cvs = document.getElementById('beforeCanvas');
    const vp = document.getElementById('beforeViewport');
    if (!cvs || !vp || !sourceCanvas) return;
    const maxW = vp.clientWidth || 360;
    const maxH = vp.clientHeight || 280;

    const scale = Math.min(maxW / sourceCanvas.width, maxH / sourceCanvas.height);
    const dw = Math.round(sourceCanvas.width * scale);
    const dh = Math.round(sourceCanvas.height * scale);

    cvs.width = dw;
    cvs.height = dh;
    const ctx = cvs.getContext('2d');
    ctx.drawImage(sourceCanvas, 0, 0, dw, dh);

    // Overlay detected face box
    if (faceBox) {
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.strokeRect(faceBox.x * scale, faceBox.y * scale, faceBox.w * scale, faceBox.h * scale);
    }

    // Overlay crop rectangle
    if (cropRect) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.strokeRect(cropRect.x * scale, cropRect.y * scale, cropRect.w * scale, cropRect.h * scale);
    }
  }

  drawAfterCanvas(exactCanvas) {
    const cvs = document.getElementById('afterCanvas');
    cvs.width = exactCanvas.width;
    cvs.height = exactCanvas.height;
    const ctx = cvs.getContext('2d');
    ctx.drawImage(exactCanvas, 0, 0);
  }

  addChip(chip) {
    this.activeChips = this.activeChips.filter(c => c.id !== chip.id);
    this.activeChips.push(chip);
  }

  renderChips() {
    const container = document.getElementById('chipsContainer');
    if (!container) return;
    container.innerHTML = '';

    // Render auto-fix chips with Undo
    this.activeChips.forEach(chip => {
      const el = document.createElement('div');
      el.className = 'chip chip-fix';
      el.innerHTML = `
        ${icon('circle-check', { size: 13, className: 'status-icon ok' })}
        <span>${chip.label}</span>
        ${chip.isUndoable ? `<button type="button" class="chip-undo-btn">${t('undo')}</button>` : ''}
      `;
      if (chip.isUndoable && chip.onUndo) {
        el.querySelector('.chip-undo-btn').addEventListener('click', chip.onUndo);
      }
      container.appendChild(el);
    });

    // Render quality warnings
    this.activeWarnings.forEach(wKey => {
      const el = document.createElement('div');
      el.className = 'chip chip-warning';
      el.innerHTML = `
        ${icon('triangle-alert', { size: 13, className: 'status-icon warn' })}
        <span>${t(wKey)}</span>
      `;
      container.appendChild(el);
    });
  }

  async runExportGuarantee() {
    if (!this.exactCanvas) return;

    try {
      this.currentExport = await exportWithGuarantee(
        this.exactCanvas,
        this.currentPreset.w,
        this.currentPreset.h,
        {
          format: this.customOptions.format,
          maxKB: this.customOptions.maxKB,
          locked: this.currentPreset.locked,
          presetKind: this.currentPreset.kind
        }
      );

      // Add format fallback warning if PNG was auto-converted to JPG
      if (this.currentExport.notices && this.currentExport.notices.length > 0) {
        this.currentExport.notices.forEach(nKey => {
          if (!this.activeWarnings.includes(nKey)) {
            this.activeWarnings.push(nKey);
          }
        });
        this.renderChips();
      }

      this.updateStatusReadout();
      document.getElementById('btnDownload').disabled = false;
      document.getElementById('btnCopyClipboard').disabled = false;
      this.saveSession();
    } catch (err) {
      console.error('Export guarantee failed:', err);
      this.updateStatusReadout(false, err.message);
      document.getElementById('btnDownload').disabled = true;
      document.getElementById('btnCopyClipboard').disabled = true;
    }
  }

  updateStatusReadout(isSuccess = true, errMsg = '') {
    const badge = document.getElementById('sizeStatusBadge');
    if (!badge) return;

    if (!isSuccess || !this.currentExport) {
      badge.className = 'size-status-badge over-limit';
      const msg = errMsg || t('errSizeExceeded', { size: `${this.customOptions.maxKB} KB` });
      badge.innerHTML = `${icon('triangle-alert', { size: 14, className: 'status-icon warn' })} <span id="sizeStatusText">${msg}</span>`;
      return;
    }

    const { size } = this.currentExport;
    const kb = (size / 1024).toFixed(1);
    const { w, h, locked } = this.currentPreset;

    const maxBytes = locked ? 99000 : this.customOptions.maxKB * 1000;
    const isUnder = size <= maxBytes;

    badge.className = `size-status-badge ${isUnder ? 'under-limit' : 'over-limit'}`;
    const statusIcon = isUnder
      ? icon('circle-check', { size: 14, className: 'status-icon ok' })
      : icon('triangle-alert', { size: 14, className: 'status-icon warn' });
    badge.innerHTML = `<span id="sizeStatusText">${w}×${h} px · ${kb} KB</span> ${statusIcon} <span>${isUnder ? t('underLimit') : t('overLimit')}</span>`;
  }

  openManualEditor() {
    if (!this.sourceData) return;
    const { fullCanvas } = this.sourceData;
    const { w, h } = this.currentPreset;

    this.editor.open(
      fullCanvas,
      w,
      h,
      this.userTransforms.crop,
      this.currentPreset,
      {
        rotation: this.userTransforms.rotation,
        straightenDeg: this.userTransforms.straightenDeg,
        flipH: this.userTransforms.flipH,
        flipV: this.userTransforms.flipV,
        allowPadding: this.userTransforms.allowPadding,
        step2Transform: this.userTransforms.step2Transform,
        maskCanvas: this.userTransforms.maskCanvas,
        croppedCanvas: this.userTransforms.croppedCanvas
      }
    );
  }

  onManualEditorApply(state) {
    this.userTransforms = {
      crop: state.crop,
      rotation: state.rotation,
      straightenDeg: state.straightenDeg,
      flipH: state.flipH,
      flipV: state.flipV,
      allowPadding: state.allowPadding,
      transformedCanvas: state.transformedCanvas,
      maskCanvas: state.maskCanvas,
      croppedCanvas: state.croppedCanvas,
      step2Transform: state.step2Transform
    };
    this.hasDownloadedCurrentWork = false;
    this.saveSession();
    this.runProcessingPipeline();
  }

  /** Save complete session state (image + all manual adjustment canvases + settings) */
  async saveSession() {
    if (this.sourceData && this.sourceData.fullCanvas) {
      await saveSessionCanvas('source', this.sourceData.fullCanvas);
    }
    if (this.userTransforms.transformedCanvas) {
      await saveSessionCanvas('transformed', this.userTransforms.transformedCanvas);
    } else {
      await removeSessionCanvas('transformed');
    }
    if (this.userTransforms.maskCanvas) {
      await saveSessionCanvas('mask', this.userTransforms.maskCanvas);
    } else {
      await removeSessionCanvas('mask');
    }
    if (this.userTransforms.croppedCanvas) {
      await saveSessionCanvas('cropped', this.userTransforms.croppedCanvas);
    } else {
      await removeSessionCanvas('cropped');
    }

    saveSessionState({
      presetId: this.currentPreset?.id || null,
      category: this.currentCategory,
      fileName: this.sourceData?.fileName || 'image',
      customOptions: { ...this.customOptions },
      userTransforms: this.userTransforms,
      autoFixes: this.autoFixes
    });
  }

  /** Restore session from IndexedDB + localStorage on page load */
  async restoreSession() {
    const state = loadSessionState();
    if (!state) return;

    try {
      // Restore preset / category first (before image loads)
      if (state.category) {
        this.selectCategory(state.category, { silent: true });
      }

      const savedPreset = PRESETS.find(p => p.id === state.presetId);
      if (savedPreset) {
        // Apply preset without triggering a pipeline run (no image yet)
        this.currentPreset = savedPreset;
        this.customOptions = { ...this.customOptions, ...(state.customOptions || {}) };
        // Sync all UI inputs with restored options
        if (document.getElementById('exportFormatSelect')) document.getElementById('exportFormatSelect').value = this.customOptions.format;
        if (document.getElementById('exportFitSelect')) document.getElementById('exportFitSelect').value = this.customOptions.fit;
        if (document.getElementById('exportBgModeSelect') && this.customOptions.bgMode) document.getElementById('exportBgModeSelect').value = this.customOptions.bgMode;
        if (document.getElementById('exportMaxSizeSelect') && this.customOptions.maxKB !== undefined) document.getElementById('exportMaxSizeSelect').value = String(this.customOptions.maxKB);
        if (document.getElementById('sigThickenSlider') && this.customOptions.thickenPx !== undefined) document.getElementById('sigThickenSlider').value = this.customOptions.thickenPx;
        if (document.getElementById('sigKeepColorCheck') && this.customOptions.keepInkColor !== undefined) document.getElementById('sigKeepColorCheck').checked = this.customOptions.keepInkColor;
        if (document.getElementById('autoDetectCheck') && this.customOptions.autoDetect !== undefined) document.getElementById('autoDetectCheck').checked = this.customOptions.autoDetect;
        this.renderPresetsGrid();
      }

      // Restore transforms
      if (state.userTransforms) {
        this.userTransforms = {
          crop: state.userTransforms.crop || null,
          rotation: state.userTransforms.rotation || 0,
          straightenDeg: state.userTransforms.straightenDeg || 0,
          flipH: state.userTransforms.flipH || false,
          flipV: state.userTransforms.flipV || false,
          allowPadding: state.userTransforms.allowPadding || false,
          step2Transform: state.userTransforms.step2Transform || null,
          transformedCanvas: null,
          maskCanvas: null,
          croppedCanvas: null
        };
      }

      if (state.autoFixes) {
        this.autoFixes = state.autoFixes;
      }

      // Restore source image canvas from IndexedDB
      const sourceCanvas = await loadSessionCanvas('source');
      if (!sourceCanvas) return;

      this.sourceData = {
        fullCanvas: sourceCanvas,
        workingCanvas: sourceCanvas,
        workingScale: 1,
        fileName: state.fileName || 'restored_image'
      };

      // Restore user manual edit canvases if present
      if (state.userTransforms?.hasTransformedCanvas) {
        this.userTransforms.transformedCanvas = await loadSessionCanvas('transformed');
      }
      if (state.userTransforms?.hasMaskCanvas) {
        this.userTransforms.maskCanvas = await loadSessionCanvas('mask');
      }
      if (state.userTransforms?.hasCroppedCanvas) {
        this.userTransforms.croppedCanvas = await loadSessionCanvas('cropped');
      }

      document.body.classList.add('has-image');
      document.querySelector('.main-content')?.classList.add('has-image');
      document.getElementById('workspaceSection').classList.remove('hidden');
      this.beforePanZoom?.reset();
      this.afterPanZoom?.reset();
      await this.runProcessingPipeline();

      console.log('[Session] 100% of user progress and manual edits restored successfully');
    } catch (err) {
      console.warn('[Session] Restore failed:', err);
    }
  }

  triggerDownload() {
    if (!this.currentExport) return;
    triggerDownload(this.currentExport.url, this.currentExport.filename);
    this.hasDownloadedCurrentWork = true;
  }

  handleDiscardClick() {
    if (!this.sourceData) return;
    if (this.hasDownloadedCurrentWork) {
      this.discardAndReset();
    } else {
      this.openDiscardModal();
    }
  }

  openDiscardModal() {
    const modal = document.getElementById('discardModal');
    if (modal) modal.classList.remove('hidden');
  }

  closeDiscardModal() {
    const modal = document.getElementById('discardModal');
    if (modal) modal.classList.add('hidden');
  }

  async discardAndReset() {
    this.sourceData = null;
    this.exactCanvas = null;
    this.currentExport = null;
    this.lastBeforeState = null;
    this.hasDownloadedCurrentWork = false;
    this.resetUserTransforms();

    this.beforePanZoom?.reset();
    this.afterPanZoom?.reset();
    document.body.classList.remove('has-image');
    document.querySelector('.main-content')?.classList.remove('has-image');

    await clearSession();

    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
    const cameraInput = document.getElementById('cameraInput');
    if (cameraInput) cameraInput.value = '';

    const beforeCanvas = document.getElementById('beforeCanvas');
    if (beforeCanvas) {
      const ctx = beforeCanvas.getContext('2d');
      ctx.clearRect(0, 0, beforeCanvas.width, beforeCanvas.height);
      beforeCanvas.width = 0;
      beforeCanvas.height = 0;
    }

    const afterCanvas = document.getElementById('afterCanvas');
    if (afterCanvas) {
      const ctx = afterCanvas.getContext('2d');
      ctx.clearRect(0, 0, afterCanvas.width, afterCanvas.height);
      afterCanvas.width = 0;
      afterCanvas.height = 0;
    }

    const chipsContainer = document.getElementById('chipsContainer');
    if (chipsContainer) chipsContainer.innerHTML = '';

    const workspace = document.getElementById('workspaceSection');
    if (workspace) workspace.classList.add('hidden');

    this.selectCategory('gov');
    this.applyPreset(PRESETS[0]);
  }

  async copyToClipboard() {
    if (!this.currentExport) return;
    try {
      await copyToClipboard(this.currentExport.blob);
      const btn = document.getElementById('btnCopyClipboard');
      const originalText = btn.textContent;
      btn.textContent = t('copied');
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    } catch (e) {
      console.warn('Clipboard copy failed:', e);
      alert('Could not copy to clipboard in this browser.');
    }
  }
}

// Initialize Application when DOM is ready
function initSnapSignFit() {
  if (!window.app) {
    window.app = new SnapSignFitApp();
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initSnapSignFit);
} else {
  initSnapSignFit();
}

