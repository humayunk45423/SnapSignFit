// js/app.js - Main Application Orchestrator, UI Events, and Auto-Processing Pipeline
import { CONFIG, t, initLanguage, setLanguage, getLanguage, updateDOMTranslations } from './i18n.js';
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
    this.populateActivePresetQuickSelect();
    this.attachDOMEvents();
    this.applyPreset(PRESETS[0]);

    // Safety net & space-pan support for preview viewports
    let isPreviewPanning = false;
    let previewStartX = 0, previewStartY = 0;
    let activePreviewCanvas = null;
    let startTransformX = 0, startTransformY = 0;

    const isSpaceActive = () => window.isSpacePressed || this.isGlobalSpacePressed;

    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;
      if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') {
        e.preventDefault();
        return;
      }
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        this.isGlobalSpacePressed = true;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') {
        e.preventDefault();
        return;
      }
      if (e.code === 'Space' || e.key === ' ') {
        this.isGlobalSpacePressed = false;
      }
    });

    for (const id of ['beforeViewport', 'afterViewport']) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.addEventListener('dragstart', e => e.preventDefault());
      el.addEventListener('contextmenu', e => e.preventDefault());

      el.addEventListener('pointerdown', (e) => {
        if (!isSpaceActive() && e.button !== 1) return;
        const canvas = el.querySelector('canvas');
        if (!canvas) return;
        isPreviewPanning = true;
        activePreviewCanvas = canvas;
        previewStartX = e.clientX;
        previewStartY = e.clientY;
        const match = (canvas.style.transform || '').match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
        startTransformX = match ? parseFloat(match[1]) : 0;
        startTransformY = match ? parseFloat(match[2]) : 0;
      });
    }

    window.addEventListener('pointermove', (e) => {
      if (!isPreviewPanning || !activePreviewCanvas) return;
      const dx = e.clientX - previewStartX;
      const dy = e.clientY - previewStartY;
      activePreviewCanvas.style.transform = `translate(${startTransformX + dx}px, ${startTransformY + dy}px)`;
    });

    window.addEventListener('pointerup', () => {
      isPreviewPanning = false;
      activePreviewCanvas = null;
    });

    // Toggle body class and scroll when workspace section opens
    const ws = document.getElementById('workspaceSection');
    if (ws) {
      new MutationObserver(() => {
        const has = !ws.classList.contains('hidden');
        document.body.classList.toggle('has-image', has);
        if (has) ws.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }).observe(ws, { attributes: true, attributeFilter: ['class'] });
    }

    // Preset preselection event from hero
    document.addEventListener('snapsignfit:preset', (e) => {
      if (e.detail) {
        this.selectPresetBySpec(e.detail);
      }
    });

    this.restoreSession(); // Restore previous session after DOM is ready

    // Preset Popup Modal
    this.initPresetPopup();

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

  initPresetPopup() {
    const overlay = document.getElementById('presetPopupOverlay');
    const grid = document.getElementById('presetPopupGrid');
    const closeBtn = document.getElementById('btnPresetPopupClose');
    const fileInput = document.getElementById('presetPopupFileInput');
    const viewPresetsBtn = document.getElementById('btnViewPresetsHero');

    if (!overlay || !grid) return;

    let popupCurrentCat = 'gov';
    let lastActiveElement = null;

    const renderPopupGrid = (cat) => {
      popupCurrentCat = cat;
      grid.innerHTML = '';
      const list = PRESETS.filter(p => p.category === cat);
      list.forEach(preset => {
        const card = document.createElement('div');
        card.className = `preset-popup-card ${preset.locked ? 'gov-card' : ''}`;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        const kindLabel = t(`kind${preset.kind.charAt(0).toUpperCase() + preset.kind.slice(1)}`) || preset.kind;
        const badgeHtml = preset.locked
          ? `<span class="ppc-badge"><i class="fa-solid fa-star star-gradient" aria-hidden="true" style="margin-right: 4px;"></i>${t('govOfficialBadge')}${preset.maxKB ? ` (≤${preset.maxKB}KB)` : ''}</span>`
          : '';
        card.innerHTML = `
          ${badgeHtml}
          <span class="ppc-kind">${kindLabel}</span>
          <div class="ppc-label">${preset.label}</div>
          <div class="ppc-dims">${preset.w} × ${preset.h} px${preset.maxKB ? ` · ≤${preset.maxKB}KB` : ''}</div>
          <div class="ppc-note">${preset.note || ''}</div>
        `;
        card.addEventListener('click', () => {
          this.applyPreset(preset);
          // Reset file input so the same file can be re-selected
          fileInput.value = '';
          fileInput.click();
        });
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            card.click();
          }
        });
        grid.appendChild(card);
      });
    };

    const openPopup = (cat = 'gov') => {
      lastActiveElement = document.activeElement;
      // Sync tab state
      document.querySelectorAll('.preset-popup-tab').forEach(t => {
        const isActive = t.dataset.cat === cat;
        t.classList.toggle('active', isActive);
        t.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      renderPopupGrid(cat);
      overlay.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      closeBtn?.focus();
    };

    const closePopup = () => {
      overlay.classList.add('hidden');
      document.body.style.overflow = '';
      if (lastActiveElement && typeof lastActiveElement.focus === 'function') {
        lastActiveElement.focus();
      }
    };

    // Tab switching
    document.querySelectorAll('.preset-popup-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.preset-popup-tab').forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        renderPopupGrid(tab.dataset.cat);
      });
    });

    // Close button & overlay backdrop click
    closeBtn?.addEventListener('click', closePopup);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closePopup();
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closePopup();
    });

    // File input change: handle the selected file
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        closePopup();
        this.handleFileUpload(e.target.files[0]);
        fileInput.value = '';
      }
    });

    // "View Presets" hero button
    viewPresetsBtn?.addEventListener('click', () => openPopup('gov'));

    // "Govt Presets" nav link
    document.getElementById('navGovPresetsBtn')?.addEventListener('click', () => openPopup('gov'));

    // Re-render popup if open when language changes
    window.addEventListener('snapsignfit:lang', () => {
      if (!overlay.classList.contains('hidden')) {
        renderPopupGrid(popupCurrentCat);
      }
    });

    // "How It Works" nav link smooth scroll & smooth flash highlight
    const howNav = document.querySelector('a[href="#how"]');
    if (howNav) {
      howNav.addEventListener('click', (e) => {
        e.preventDefault();
        const howSec = document.getElementById('how');
        if (howSec) {
          howSec.scrollIntoView({ behavior: 'smooth', block: 'center' });
          howSec.classList.remove('flash-highlight');
          void howSec.offsetWidth; // Force reflow
          howSec.classList.add('flash-highlight');
          setTimeout(() => {
            howSec.classList.remove('flash-highlight');
          }, 1500);
        }
      });
    }

    // Expose for external use (e.g., chip row)
    this._openPresetPopup = openPopup;
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

    // Default is always light; only use saved theme if the user explicitly set it
    const theme = savedTheme || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    this.updateThemeButtonIcon(theme);
  }

  updateThemeButtonIcon(theme) {
    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
      const isDark = theme === 'dark';
      btn.setAttribute('data-state', isDark ? 'right' : 'left');
      btn.setAttribute('aria-label', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
      btn.setAttribute('title', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
    }
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
    const langBtn = document.getElementById('langToggleBtn');
    if (langBtn) {
      langBtn.addEventListener('click', () => {
        const newLang = getLanguage() === 'en' ? 'bn' : 'en';
        setLanguage(newLang);
        this.populateActivePresetQuickSelect();
        this.updateActivePresetPill(this.currentPreset);
        this.renderPresetsGrid();
        this.updateStatusReadout();
      });
    }

    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        this.toggleTheme();
      });
    }

    // File Upload & Camera
    const fileInput = document.getElementById('fileInput');
    const cameraInput = document.getElementById('cameraInput');
    const dropzone = document.getElementById('dropzone');

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
      this.updateActivePresetPill(this.currentPreset);
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
      const maxLimit = this.currentPreset?.locked ? (this.currentPreset.maxKB || 99) : 2000;
      if (this.currentPreset?.locked && val > maxLimit) {
        val = maxLimit;
        maxSizeSelect.value = String(maxLimit);
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
    const customBgColorInput = document.getElementById('exportCustomBgColor');
    if (bgModeSelect) {
      bgModeSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        this.customOptions.bgMode = val;
        if (val === 'custom') {
          customBgColorInput?.classList.remove('hidden');
          customBgColorInput?.click();
        } else {
          customBgColorInput?.classList.add('hidden');
        }
        this.hasDownloadedCurrentWork = false;
        this.runProcessingPipeline();
      });
    }
    if (customBgColorInput) {
      customBgColorInput.addEventListener('input', (e) => {
        this.customOptions.customBgColor = e.target.value;
        if (this.customOptions.bgMode === 'custom') {
          this.hasDownloadedCurrentWork = false;
          this.runProcessingPipeline();
        }
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
    if (zoomToggleBtn) {
      zoomToggleBtn.addEventListener('click', () => {
        this.customOptions.zoom2x = !this.customOptions.zoom2x;
        const vp = document.getElementById('afterViewport');
        if (vp) {
          const is2x = vp.classList.toggle('zoom-2x', this.customOptions.zoom2x);
          zoomToggleBtn.textContent = is2x ? '2× Zoomed' : '1× Real Pixels';
        }
      });
    }

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

    const activePresetSelect = document.getElementById('activePresetQuickSelect');
    if (activePresetSelect) {
      activePresetSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'custom') {
          this.selectCategory('custom');
          this.updateActivePresetPill(this.currentPreset);
        } else {
          const match = PRESETS.find(p => p.id === val);
          if (match) {
            if (this.currentCategory !== match.category) {
              this.selectCategory(match.category);
            }
            this.applyPreset(match);
          }
        }
      });
    }
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
      const kindLabel = t(`kind${preset.kind.charAt(0).toUpperCase() + preset.kind.slice(1)}`) || preset.kind;
      card.innerHTML = `
        <div>
          <div class="preset-card-header">
            <span class="preset-card-kind">${kindLabel}</span>
            ${preset.locked ? `<span class="preset-card-badge"><i class="fa-solid fa-star star-gradient" aria-hidden="true" style="margin-right: 4px;"></i>${t('lockedGovBadge')}${preset.maxKB ? ` (≤${preset.maxKB}KB)` : ''}</span>` : ''}
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

  populateActivePresetQuickSelect() {
    const select = document.getElementById('activePresetQuickSelect');
    if (!select) return;

    const govPresets = PRESETS.filter(p => p.category === 'gov');
    const socialPresets = PRESETS.filter(p => p.category === 'social');

    const govLabel = t('catGov') || 'Government & Exam';
    const socialLabel = t('catSocial') || 'Social & Web';
    const customLabel = t('catCustom') || 'Custom Size';

    let html = `<optgroup label="★ ${govLabel}">`;
    govPresets.forEach(p => {
      const kbStr = p.maxKB ? ` (≤${p.maxKB}KB)` : '';
      html += `<option value="${p.id}">${p.label}${kbStr} — ${p.w}×${p.h}</option>`;
    });
    html += `</optgroup>`;

    html += `<optgroup label="🌐 ${socialLabel}">`;
    socialPresets.forEach(p => {
      const kbStr = p.maxKB ? ` (≤${p.maxKB}KB)` : '';
      html += `<option value="${p.id}">${p.label}${kbStr} — ${p.w}×${p.h}</option>`;
    });
    html += `</optgroup>`;

    html += `<optgroup label="⚙️ ${customLabel}">`;
    const curW = document.getElementById('customW')?.value || (this.currentPreset?.w || 300);
    const curH = document.getElementById('customH')?.value || (this.currentPreset?.h || 300);
    html += `<option value="custom">${customLabel} (${curW}×${curH})</option>`;
    html += `</optgroup>`;

    select.innerHTML = html;

    if (this.currentPreset) {
      if (this.currentPreset.category === 'custom' || this.currentPreset.id?.startsWith('custom')) {
        select.value = 'custom';
      } else {
        select.value = this.currentPreset.id;
      }
    }
  }

  updateActivePresetPill(preset) {
    if (!preset) return;
    const pill = document.getElementById('activePresetPill');
    const label = document.getElementById('activePresetLabel');
    const select = document.getElementById('activePresetQuickSelect');
    const afterDims = document.getElementById('afterDimensionsReadout');

    if (afterDims) {
      afterDims.textContent = `${preset.w} × ${preset.h} px`;
    }

    if (!label) return;

    const kbStr = preset.maxKB ? ` (≤${preset.maxKB}KB)` : '';
    let display = `${preset.label}${kbStr}`;
    if (preset.category === 'custom' || preset.id?.startsWith('custom')) {
      display = `${t('catCustom') || 'Custom'} (${preset.w}×${preset.h})`;
    }
    label.textContent = display;

    if (pill) {
      pill.title = `${display} — ${preset.w}×${preset.h} px (Tap/Click to choose preset)`;
    }

    if (select) {
      if (preset.category === 'custom' || preset.id?.startsWith('custom')) {
        let opt = select.querySelector('option[value="custom"]');
        if (!opt) {
          const optgroup = select.querySelector('optgroup:last-child') || select;
          opt = document.createElement('option');
          opt.value = 'custom';
          optgroup.appendChild(opt);
        }
        opt.textContent = `${t('catCustom') || 'Custom'} (${preset.w}×${preset.h})`;
        select.value = 'custom';
      } else {
        select.value = preset.id;
      }
    }
  }

  selectPresetBySpec(spec) {
    const match = PRESETS.find(p => p.w === spec.w && p.h === spec.h) || {
      id: `custom_${spec.w}x${spec.h}`,
      label: `${spec.w}×${spec.h}`,
      category: 'custom',
      kind: spec.kind || (spec.h <= 100 ? 'signature' : 'photo'),
      w: spec.w,
      h: spec.h,
      maxKB: spec.maxKB || 99,
      format: 'jpg',
      fit: spec.kind === 'signature' ? 'contain' : 'cover',
      locked: !!spec.maxKB && spec.maxKB <= 99
    };
    this.applyPreset(match);
  }

  applyPreset(preset) {
    this.currentPreset = preset;
    this.hasDownloadedCurrentWork = false;
    this.customOptions.format = preset.format || 'jpg';
    this.customOptions.fit = preset.fit || 'cover';
    this.customOptions.maxKB = preset.maxKB || (preset.locked ? 99 : 100);

    // Sync settings bar UI
    document.getElementById('exportFormatSelect').value = this.customOptions.format;
    document.getElementById('exportFitSelect').value = this.customOptions.fit;

    // Configure Max Size Select according to Gov locked status
    const maxSizeSelect = document.getElementById('exportMaxSizeSelect');
    maxSizeSelect.innerHTML = '';

    if (preset.locked) {
      const pKB = preset.maxKB || 99;
      if (pKB <= 50) {
        maxSizeSelect.innerHTML = `
          <option value="50" selected>50 KB (Gov locked)</option>
        `;
      } else if (pKB <= 60) {
        maxSizeSelect.innerHTML = `
          <option value="50">50 KB</option>
          <option value="60" selected>60 KB (Gov locked)</option>
        `;
      } else {
        maxSizeSelect.innerHTML = `
          <option value="50">50 KB</option>
          <option value="60">60 KB</option>
          <option value="99" selected>100 KB (Gov locked)</option>
        `;
      }
    } else {
      maxSizeSelect.innerHTML = `
        <option value="50">50 KB</option>
        <option value="60">60 KB</option>
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
    this.updateActivePresetPill(preset);

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
      document.getElementById('hero')?.classList.add('hidden');
      document.getElementById('how')?.classList.add('hidden');
      document.getElementById('workspaceSection').classList.remove('hidden');
      this.resetUserTransforms();
      await this.runProcessingPipeline({ fromFileUpload: true });
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
      const hasCustomEdits = this.userTransforms.transformedCanvas && (
        this.userTransforms.maskCanvas !== null ||
        this.userTransforms.rotation !== 0 ||
        this.userTransforms.straightenDeg !== 0 ||
        (this.userTransforms.step2Transform?.zoom && this.userTransforms.step2Transform.zoom !== 1.0) ||
        (this.userTransforms.step2Transform?.panX !== 0 || this.userTransforms.step2Transform?.panY !== 0) ||
        this.userTransforms.flipH ||
        this.userTransforms.flipV
      );

      // If user applied manual adjustments in the editor without stroke thickening adjustments
      if (this.userTransforms.transformedCanvas && (hasCustomEdits || (this.customOptions.thickenPx === 0 && !this.customOptions.keepInkColor))) {
        this.exactCanvas = this.userTransforms.transformedCanvas;
        computedCrop = this.userTransforms.crop || null;
      } else {
        let sigSource = activeFull;
        let useFull = !this.customOptions.autoDetect;

        if (this.userTransforms.crop) {
          const c = this.userTransforms.crop;
          const cropCvs = createCanvas(Math.max(1, Math.round(c.w)), Math.max(1, Math.round(c.h)));
          const cCtx = cropCvs.getContext('2d');
          cCtx.drawImage(activeFull, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
          sigSource = cropCvs;
          useFull = true;
          computedCrop = c;
        }

        signatureResult = processSignature(sigSource, targetW, targetH, {
          keepInkColor: this.customOptions.keepInkColor,
          thickenPx: this.customOptions.thickenPx,
          useFullImage: useFull,
          bgColor: '#ffffff'
        });

        if (!signatureResult.success) {
          if (this.userTransforms.transformedCanvas) {
            this.exactCanvas = this.userTransforms.transformedCanvas;
          } else {
            this.activeWarnings.push('warnNoSignature');
            // Create a proper white canvas at exact target dimensions so export doesn't fail
            const fallbackCanvas = createCanvas(targetW, targetH);
            const fCtx = fallbackCanvas.getContext('2d');
            fCtx.fillStyle = '#ffffff';
            fCtx.fillRect(0, 0, targetW, targetH);
            this.exactCanvas = fallbackCanvas;
          }
          if (!computedCrop) computedCrop = signatureResult.bbox;

          const effectiveCrop = this.userTransforms.crop || computedCrop;
          this.drawBeforeCanvas(activeFull, null, effectiveCrop, kind);
          this.drawAfterCanvas(this.exactCanvas);
          this.renderChips();

          // Run export guarantee on fallback canvas
          await this.runExportGuarantee();
          this.setProcessing(false);

          // Open manual editor only on preset/option changes, not on initial file load.
          if (!fromFileUpload && !this.manualEditorOpenedForFile) {
            this.manualEditorOpenedForFile = true;
            this.openManualEditor();
          }
          return;
        } else {
          if (signatureResult.warnings) {
            this.activeWarnings.push(...signatureResult.warnings);
          }

          // Test signature paper tilt only if user hasn't manually cropped or rotated
          if (!this.userTransforms.crop && this.userTransforms.rotation === 0) {
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
          if (!computedCrop) {
            computedCrop = signatureResult.bbox;
          }
        }
      }
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

      // Resolve background color based on bgMode
      let resolvedBgColor = '#ffffff';
      if (this.customOptions.bgMode === 'blue') resolvedBgColor = '#dbeafe';
      else if (this.customOptions.bgMode === 'gray') resolvedBgColor = '#f1f5f9';
      else if (this.customOptions.bgMode === 'red') resolvedBgColor = '#dc2626';
      else if (this.customOptions.bgMode === 'custom') resolvedBgColor = this.customOptions.customBgColor || '#3b82f6';
      else if (this.customOptions.bgMode === 'white') resolvedBgColor = '#ffffff';

      if (this.userTransforms.transformedCanvas) {
        this.exactCanvas = this.userTransforms.transformedCanvas;
      } else {
        // Fit mode rendering
        this.exactCanvas = renderFitMode(activeFull, targetW, targetH, {
          fit: this.customOptions.fit,
          cropRect: effectiveCrop,
          bgColor: resolvedBgColor,
          blurredBg: false,
          transparent: this.customOptions.bgMode === 'transparent'
        });
      }

      // Background Removal / Solid Color replacement handling
      if ((this.customOptions.bgMode === 'remove' || this.customOptions.bgMode === 'blue' || this.customOptions.bgMode === 'gray' || this.customOptions.bgMode === 'red' || this.customOptions.bgMode === 'custom') && kind !== 'signature') {
        const faceCenter = primaryFace ? {
          x: (primaryFace.box.x + primaryFace.box.w / 2 - (effectiveCrop?.x || 0)) / (effectiveCrop?.w || activeFull.width),
          y: (primaryFace.box.y + primaryFace.box.h / 2 - (effectiveCrop?.y || 0)) / (effectiveCrop?.h || activeFull.height)
        } : null;

        const bgRes = await removeBackgroundToWhite(this.exactCanvas, faceCenter, resolvedBgColor);
        if (bgRes.skipped) {
          if (this.customOptions.bgMode === 'remove') this.activeWarnings.push('bgSkippedToast');
        } else {
          this.exactCanvas = bgRes.canvas;
        }
      }
    }

    const effectiveCrop = this.userTransforms.crop || computedCrop;
    this.lastComputedCrop = computedCrop;

    // Draw Before canvas with detection overlay
    this.drawBeforeCanvas(activeFull, primaryFace?.box, effectiveCrop, kind);

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
    if (!cvs || !vp || !sourceCanvas || sourceCanvas.width <= 0 || sourceCanvas.height <= 0) return;
    const maxW = Math.max(100, vp.clientWidth || 360);
    const maxH = Math.max(100, vp.clientHeight || 280);

    const scale = Math.min(maxW / sourceCanvas.width, maxH / sourceCanvas.height);
    const dw = Math.max(1, Math.round(sourceCanvas.width * scale));
    const dh = Math.max(1, Math.round(sourceCanvas.height * scale));

    cvs.width = dw;
    cvs.height = dh;
    const ctx = cvs.getContext('2d');
    if (sourceCanvas.width > 0 && sourceCanvas.height > 0 && dw > 0 && dh > 0) {
      ctx.drawImage(sourceCanvas, 0, 0, dw, dh);
    }

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
    if (!exactCanvas || exactCanvas.width <= 0 || exactCanvas.height <= 0) return;
    const cvs = document.getElementById('afterCanvas');
    if (!cvs) return;
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

    const maxBytes = locked ? ((this.currentPreset.maxKB || 99) * 1000) : (this.customOptions.maxKB * 1000);
    const isUnder = size <= maxBytes;

    badge.className = `size-status-badge ${isUnder ? 'under-limit' : 'over-limit'}`;
    const statusIcon = isUnder
      ? icon('circle-check', { size: 14, className: 'status-icon ok' })
      : icon('triangle-alert', { size: 14, className: 'status-icon warn' });
    badge.innerHTML = `<span class="size-badge-dims" id="sizeStatusText">${w}×${h} px · ${kb} KB</span> <span class="size-badge-pill">${statusIcon} <span>${isUnder ? t('underLimit') : t('overLimit')}</span></span>`;
  }

  openManualEditor() {
    if (!this.sourceData) return;
    const { fullCanvas } = this.sourceData;
    const { w, h } = this.currentPreset;

    this.editor.open(
      fullCanvas,
      w,
      h,
      this.userTransforms.crop || this.lastComputedCrop,
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
    this.customOptions.autoDetect = false;
    const autoDetectCheck = document.getElementById('autoDetectCheck');
    if (autoDetectCheck) autoDetectCheck.checked = false;
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
      document.getElementById('hero')?.classList.add('hidden');
      document.getElementById('how')?.classList.add('hidden');
      document.getElementById('workspaceSection').classList.remove('hidden');
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

    document.body.classList.remove('has-image');
    document.querySelector('.main-content')?.classList.remove('has-image');
    document.getElementById('hero')?.classList.remove('hidden');
    document.getElementById('how')?.classList.remove('hidden');

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
      beforeCanvas.style.transform = '';
    }

    const afterCanvas = document.getElementById('afterCanvas');
    if (afterCanvas) {
      const ctx = afterCanvas.getContext('2d');
      ctx.clearRect(0, 0, afterCanvas.width, afterCanvas.height);
      afterCanvas.width = 0;
      afterCanvas.height = 0;
      afterCanvas.style.transform = '';
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

