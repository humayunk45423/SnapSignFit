// js/app.js - Main Application Orchestrator, UI Events, and Auto-Processing Pipeline
import { CONFIG, t, initLanguage, setLanguage, getLanguage, updateDOMTranslations } from './i18n.js';
import { PRESETS, getSavedCustomPresets, saveCustomPreset, unitToPixels } from './presets.js';
import { loadImageFile, createCanvas, flattenAlpha } from './loader.js';
import { detectFacesWithLadder, selectPrimaryFace, computePassportCrop, checkFaceQuality, rotateCanvas } from './face.js';
import { calculateEyeTilt, rotateWithEdgeReplication, autoEnhanceCanvas, detectSignaturePaperTilt } from './orient.js';
import { processSignature, classifyImageContent } from './signature.js';
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
    this.populateActivePresetDropdown();
    this.attachDOMEvents();
    this.applyPreset(PRESETS[0]);
    window.addEventListener('resize', () => this.fitActivePresetPillText());

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

    // Enable smooth user-triggered transitions after initial paint completes
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.classList.remove('preload');
      });
    });
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
        card.className = `preset-popup-card ${preset.locked ? (preset.category === 'duet' ? 'gov-card duet-card' : 'gov-card') : ''}`;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        const kindLabel = t(`kind${preset.kind.charAt(0).toUpperCase() + preset.kind.slice(1)}`) || preset.kind;
        let badgeHtml = '';
        if (preset.locked) {
          const isDuet = preset.category === 'duet';
          const icon = isDuet
            ? '<i class="fa-solid fa-graduation-cap" style="color: #a78bfa; margin-right: 4px;" aria-hidden="true"></i>'
            : '<i class="fa-solid fa-star star-gradient" aria-hidden="true" style="margin-right: 4px;"></i>';
          const badgeText = isDuet ? (t('duetOfficialBadge') || 'DUET Official') : (t('govOfficialBadge') || 'Gov Official');
          badgeHtml = `<span class="ppc-badge ${isDuet ? 'ppc-badge-duet' : ''}">${icon}${badgeText}${preset.maxKB ? ` (≤${preset.maxKB}KB)` : ''}</span>`;
        }
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

    // "All Presets" hero button
    viewPresetsBtn?.addEventListener('click', () => openPopup('gov'));

    // "DUET Presets" hero button
    document.getElementById('btnDuetPresetsHero')?.addEventListener('click', () => openPopup('duet'));

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



  showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconHtml = '';
    if (type === 'success') iconHtml = icon('circle-check', { size: 16, className: 'toast-icon' });
    else if (type === 'error') iconHtml = icon('circle-alert', { size: 16, className: 'toast-icon' });
    else if (type === 'warn') iconHtml = icon('triangle-alert', { size: 16, className: 'toast-icon' });
    else iconHtml = icon('info', { size: 16, className: 'toast-icon' });

    toast.innerHTML = `${iconHtml}<div class="toast-message">${message}</div>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-hiding');
      setTimeout(() => {
        if (toast.parentElement) toast.parentElement.removeChild(toast);
      }, 260);
    }, duration);
  }

  setupGlobalErrors() {
    const banner = document.getElementById('globalBanner');
    const bannerText = document.getElementById('globalBannerText');
    const bannerBtn = document.getElementById('bannerManualBtn');

    const showError = (msg) => {
      console.error('Handled application error:', msg);
      if (banner && bannerText) {
        bannerText.textContent = msg || t('genericError');
        banner.classList.remove('hidden');
      }
      this.showToast(msg || t('genericError'), 'error');
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

  /**
   * Tactile micro-haptic feedback for mobile and supported devices
   */
  haptic(pattern = 10) {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(pattern);
      }
    } catch (_) {}
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
    this.haptic(15);
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
        this.haptic(15);
        const newLang = getLanguage() === 'en' ? 'bn' : 'en';
        setLanguage(newLang);
        this.populateActivePresetDropdown();
        this.updateActivePresetPill(this.currentPreset);
        this.renderPresetsGrid();
        this.updateStatusReadout();
        this.updateZoomBtnText(this.customOptions.zoom2x);
      });
    }

    window.addEventListener('snapsignfit:lang', () => {
      this.updateZoomBtnText(this.customOptions.zoom2x);
    });

    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        this.toggleTheme();
      });
    }

    this.setupGlobalDragAndDrop();
    this.setupHoldToCompare();

    // File Upload & Camera
    const fileInput = document.getElementById('fileInput');
    const cameraInput = document.getElementById('cameraInput');
    const dropzone = document.getElementById('dropzone');

    document.getElementById('btnChooseFile').addEventListener('click', () => {
      if (fileInput) fileInput.value = '';
      fileInput?.click();
    });
    document.getElementById('btnTakePhoto').addEventListener('click', () => {
      if (cameraInput) cameraInput.value = '';
      cameraInput?.click();
    });

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

    // Global Pro Keyboard Shortcuts (Ctrl+S / Cmd+S to Download, Ctrl+Z to Undo)
    window.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      // Ctrl+S / Cmd+S -> Download current processed image
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (this.currentExport && !document.getElementById('btnDownload')?.disabled) {
          this.triggerDownload();
        }
      }

      // Ctrl+Z / Cmd+Z -> Undo auto-fix chip if editor is not open
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (!window.__manualEditor?.overlayEl || window.__manualEditor.overlayEl.classList.contains('hidden')) {
          const undoable = this.activeChips.filter(c => c.isUndoable && c.onUndo);
          if (undoable.length > 0) {
            e.preventDefault();
            const last = undoable[undoable.length - 1];
            last.onUndo();
          }
        }
      }
    });

    // Warn before leaving if work is unsaved
    window.addEventListener('beforeunload', (e) => {
      if (this.sourceData && !this.hasDownloadedCurrentWork) {
        e.preventDefault();
        e.returnValue = '';
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
    document.getElementById('tabGov')?.addEventListener('click', () => this.selectCategory('gov'));
    document.getElementById('tabDuet')?.addEventListener('click', () => this.selectCategory('duet'));
    document.getElementById('tabSocial')?.addEventListener('click', () => this.selectCategory('social'));
    document.getElementById('tabCustom')?.addEventListener('click', () => this.selectCategory('custom'));

    // Preset Search
    const searchInput = document.getElementById('presetSearchInput');
    searchInput.addEventListener('input', (e) => this.filterPresets(e.target.value));

    // Custom Size Form
    const updateCustomPreset = () => {
      const rawW = parseInt(document.getElementById('customW').value) || 300;
      const rawH = parseInt(document.getElementById('customH').value) || 300;
      const w = Math.max(1, Math.min(8000, rawW));
      const h = Math.max(1, Math.min(8000, rawH));
      const unit = document.getElementById('customUnit').value;
      const rawDpi = parseInt(document.getElementById('customDpi').value) || 300;
      const dpi = Math.max(72, Math.min(1200, rawDpi));
      const kind = document.getElementById('customKind').value;
      const fit = document.getElementById('customFit').value;

      const pxW = Math.max(1, Math.min(8000, unitToPixels(w, unit, dpi)));
      const pxH = Math.max(1, Math.min(8000, unitToPixels(h, unit, dpi)));

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
      this.showToast(t('presetSaved'), 'success');
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
        this.haptic(10);
        this.customOptions.zoom2x = !this.customOptions.zoom2x;
        const vp = document.getElementById('afterViewport');
        if (vp) {
          const is2x = vp.classList.toggle('zoom-2x', this.customOptions.zoom2x);
          zoomToggleBtn.classList.toggle('active', is2x);
          this.updateZoomBtnText(is2x);
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

    const activePresetPill = document.getElementById('activePresetPill');
    const activePresetMenu = document.getElementById('activePresetDropdownMenu');

    if (activePresetPill && activePresetMenu) {
      activePresetPill.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleActivePresetDropdown();
      });

      // Close custom dropdown when clicking outside
      document.addEventListener('pointerdown', (e) => {
        if (!activePresetMenu.classList.contains('hidden') &&
            !activePresetMenu.contains(e.target) &&
            !activePresetPill.contains(e.target)) {
          this.closeActivePresetDropdown();
        }
      });

      // Close custom dropdown on Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !activePresetMenu.classList.contains('hidden')) {
          this.closeActivePresetDropdown();
        }
      });
    }
  }

  setupGlobalDragAndDrop() {
    const overlay = document.getElementById('globalDragOverlay');
    let dragCounter = 0;

    const hasFiles = (e) => {
      if (!e.dataTransfer) return false;
      const types = Array.from(e.dataTransfer.types || []);
      return types.includes('Files');
    };

    window.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter++;
      if (overlay && dragCounter === 1) {
        overlay.classList.remove('hidden');
        overlay.setAttribute('aria-hidden', 'false');
      }
    });

    window.addEventListener('dragover', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    window.addEventListener('dragleave', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        if (overlay) {
          overlay.classList.add('hidden');
          overlay.setAttribute('aria-hidden', 'true');
        }
      }
    });

    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter = 0;
      if (overlay) {
        overlay.classList.add('hidden');
        overlay.setAttribute('aria-hidden', 'true');
      }

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file && (file.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|bmp|tiff?)$/i.test(file.name))) {
          this.haptic([20, 40, 20]);
          this.handleFileUpload(file);
        }
      }
    });
  }

  setupHoldToCompare() {
    const btn = document.getElementById('btnHoldCompare');
    const badge = document.getElementById('comparingBadge');
    const afterCvs = document.getElementById('afterCanvas');
    if (!btn || !afterCvs) return;

    btn.disabled = true;
    let isComparing = false;

    const startComparing = (e) => {
      if (e) {
        if (e.type === 'pointerdown' || e.type === 'touchstart') {
          e.preventDefault();
        }
      }
      if (isComparing || !this.sourceData || !this.exactCanvas) return;
      isComparing = true;
      btn.classList.add('is-comparing');
      if (badge) badge.classList.remove('hidden');
      this.haptic(12);

      const ctx = afterCvs.getContext('2d');
      const targetW = this.exactCanvas.width;
      const targetH = this.exactCanvas.height;
      afterCvs.width = targetW;
      afterCvs.height = targetH;

      const raw = this.sourceData.fullCanvas || this.sourceData.workingCanvas;
      if (raw) {
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        const scale = Math.min(targetW / raw.width, targetH / raw.height);
        const dw = raw.width * scale;
        const dh = raw.height * scale;
        const dx = (targetW - dw) / 2;
        const dy = (targetH - dh) / 2;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(raw, dx, dy, dw, dh);
        ctx.restore();
      }
    };

    const stopComparing = () => {
      if (!isComparing) return;
      isComparing = false;
      btn.classList.remove('is-comparing');
      if (badge) badge.classList.add('hidden');
      this.haptic(8);

      if (this.exactCanvas) {
        this.drawAfterCanvas(this.exactCanvas);
      }
    };

    btn.addEventListener('pointerdown', startComparing);
    btn.addEventListener('pointerup', stopComparing);
    btn.addEventListener('pointercancel', stopComparing);
    btn.addEventListener('pointerleave', () => {
      if (isComparing) stopComparing();
    });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());

    // Keyboard shortcut 'C' to compare
    window.addEventListener('keydown', (e) => {
      if (e.key === 'c' || e.key === 'C') {
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;
        if (!e.repeat) {
          startComparing();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'c' || e.key === 'C') {
        stopComparing();
      }
    });

    window.addEventListener('blur', stopComparing);
  }

  updateZoomBtnText(is2x = false) {
    const btn = document.getElementById('btnToggleZoom');
    if (!btn) return;
    const fullSpan = btn.querySelector('.btn-text-full');
    const shortSpan = btn.querySelector('.btn-text-short');
    const fullText = is2x ? (t('zoom2x') || '2× Zoomed') : (t('zoomReal') || '1× Real Pixels');
    const shortText = is2x ? (t('zoom2xShort') || '2× Zoom') : (t('zoomRealShort') || '1× Real');
    if (fullSpan && shortSpan) {
      fullSpan.textContent = fullText;
      shortSpan.textContent = shortText;
    } else {
      btn.textContent = fullText;
    }
  }

  selectCategory(cat) {
    this.haptic(12);
    this.currentCategory = cat;
    ['tabGov', 'tabDuet', 'tabSocial', 'tabCustom'].forEach(id => {
      document.getElementById(id)?.classList.remove('active');
    });
    
    if (cat === 'gov') document.getElementById('tabGov')?.classList.add('active');
    if (cat === 'duet') document.getElementById('tabDuet')?.classList.add('active');
    if (cat === 'social') document.getElementById('tabSocial')?.classList.add('active');
    if (cat === 'custom') document.getElementById('tabCustom')?.classList.add('active');

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
      const isDuet = preset.category === 'duet';
      card.className = `preset-card ${preset.locked ? (isDuet ? 'card-gov card-duet' : 'card-gov') : ''} ${preset.id === this.currentPreset?.id ? 'active' : ''}`;
      const kindLabel = t(`kind${preset.kind.charAt(0).toUpperCase() + preset.kind.slice(1)}`) || preset.kind;
      let badgeHtml = '';
      if (preset.locked) {
        const icon = isDuet
          ? '<i class="fa-solid fa-graduation-cap" style="color: #a78bfa; margin-right: 4px;" aria-hidden="true"></i>'
          : '<i class="fa-solid fa-star star-gradient" aria-hidden="true" style="margin-right: 4px;"></i>';
        const badgeText = isDuet ? (t('duetOfficialBadge') || 'DUET Official') : (t('lockedGovBadge') || 'Gov Locked');
        badgeHtml = `<span class="preset-card-badge ${isDuet ? 'badge-duet' : ''}">${icon}${badgeText}${preset.maxKB ? ` (≤${preset.maxKB}KB)` : ''}</span>`;
      }
      card.innerHTML = `
        <div>
          <div class="preset-card-header">
            <span class="preset-card-kind">${kindLabel}</span>
            ${badgeHtml}
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

  toggleActivePresetDropdown() {
    const menu = document.getElementById('activePresetDropdownMenu');
    const pill = document.getElementById('activePresetPill');
    if (!menu || !pill) return;

    const isHidden = menu.classList.contains('hidden');
    if (isHidden) {
      this.populateActivePresetDropdown();
      menu.classList.remove('hidden');
      pill.classList.add('open');
      pill.setAttribute('aria-expanded', 'true');
    } else {
      this.closeActivePresetDropdown();
    }
  }

  closeActivePresetDropdown() {
    const menu = document.getElementById('activePresetDropdownMenu');
    const pill = document.getElementById('activePresetPill');
    if (menu) menu.classList.add('hidden');
    if (pill) {
      pill.classList.remove('open');
      pill.setAttribute('aria-expanded', 'false');
    }
  }

  selectPresetFromDropdown(presetId) {
    if (presetId === 'custom') {
      this.selectCategory('custom');
      this.updateActivePresetPill(this.currentPreset);
    } else {
      const match = PRESETS.find(p => p.id === presetId);
      if (match) {
        if (this.currentCategory !== match.category) {
          this.selectCategory(match.category);
        }
        this.applyPreset(match);
      }
    }
    this.closeActivePresetDropdown();
  }

  populateActivePresetDropdown() {
    const menu = document.getElementById('activePresetDropdownMenu');
    if (!menu) return;

    const govPresets = PRESETS.filter(p => p.category === 'gov');
    const duetPresets = PRESETS.filter(p => p.category === 'duet');
    const socialPresets = PRESETS.filter(p => p.category === 'social');

    const govLabel = t('catGov') || 'Government & Exam';
    const duetLabel = t('catDuet') || 'DUET Admission';
    const socialLabel = t('catSocial') || 'Social & Web';
    const customLabel = t('catCustom') || 'Custom Size';

    let html = '';

    // 1. Govt & Exam Group
    html += `<div class="active-preset-menu-group">
      <div class="active-preset-menu-group-header">
        <i class="fa-solid fa-star star-gradient" aria-hidden="true"></i>
        <span>${govLabel}</span>
      </div>
      <div class="active-preset-menu-group-items">`;
    govPresets.forEach(p => {
      const isSelected = this.currentPreset && this.currentPreset.id === p.id;
      const kbStr = p.maxKB ? `≤${p.maxKB}KB` : '';
      html += `
        <div class="active-preset-menu-item ${isSelected ? 'selected' : ''}" role="option" aria-selected="${isSelected}" data-preset-id="${p.id}">
          <div class="active-preset-item-main">
            <span class="active-preset-item-name">${p.label}</span>
            ${kbStr ? `<span class="active-preset-item-badge">${kbStr}</span>` : ''}
          </div>
          <span class="active-preset-item-dims">${p.w}×${p.h}</span>
          ${isSelected ? '<i class="fa-solid fa-check active-preset-item-check" aria-hidden="true"></i>' : ''}
        </div>`;
    });
    html += `</div></div>`;

    // 2. DUET Admission Group
    if (duetPresets.length > 0) {
      html += `<div class="active-preset-menu-group">
        <div class="active-preset-menu-group-header">
          <i class="fa-solid fa-graduation-cap" style="color: #a78bfa;" aria-hidden="true"></i>
          <span>${duetLabel}</span>
        </div>
        <div class="active-preset-menu-group-items">`;
      duetPresets.forEach(p => {
        const isSelected = this.currentPreset && this.currentPreset.id === p.id;
        const kbStr = p.maxKB ? `≤${p.maxKB}KB` : '';
        html += `
          <div class="active-preset-menu-item ${isSelected ? 'selected' : ''}" role="option" aria-selected="${isSelected}" data-preset-id="${p.id}">
            <div class="active-preset-item-main">
              <span class="active-preset-item-name">${p.label}</span>
              ${kbStr ? `<span class="active-preset-item-badge">${kbStr}</span>` : ''}
            </div>
            <span class="active-preset-item-dims">${p.w}×${p.h}</span>
            ${isSelected ? '<i class="fa-solid fa-check active-preset-item-check" aria-hidden="true"></i>' : ''}
          </div>`;
      });
      html += `</div></div>`;
    }

    // 3. Social & Web Group
    html += `<div class="active-preset-menu-group">
      <div class="active-preset-menu-group-header">
        <i class="fa-solid fa-globe" style="color: #38bdf8;" aria-hidden="true"></i>
        <span>${socialLabel}</span>
      </div>
      <div class="active-preset-menu-group-items">`;
    socialPresets.forEach(p => {
      const isSelected = this.currentPreset && this.currentPreset.id === p.id;
      const kbStr = p.maxKB ? `≤${p.maxKB}KB` : '';
      html += `
        <div class="active-preset-menu-item ${isSelected ? 'selected' : ''}" role="option" aria-selected="${isSelected}" data-preset-id="${p.id}">
          <div class="active-preset-item-main">
            <span class="active-preset-item-name">${p.label}</span>
            ${kbStr ? `<span class="active-preset-item-badge">${kbStr}</span>` : ''}
          </div>
          <span class="active-preset-item-dims">${p.w}×${p.h}</span>
          ${isSelected ? '<i class="fa-solid fa-check active-preset-item-check" aria-hidden="true"></i>' : ''}
        </div>`;
    });
    html += `</div></div>`;

    // 3. Custom Size Group
    const isCustom = this.currentPreset && (this.currentPreset.category === 'custom' || this.currentPreset.id?.startsWith('custom'));
    const curW = document.getElementById('customW')?.value || (this.currentPreset?.w || 300);
    const curH = document.getElementById('customH')?.value || (this.currentPreset?.h || 300);
    html += `<div class="active-preset-menu-group">
      <div class="active-preset-menu-group-header">
        <i class="fa-solid fa-sliders" style="color: #c084fc;" aria-hidden="true"></i>
        <span>${customLabel}</span>
      </div>
      <div class="active-preset-menu-group-items">
        <div class="active-preset-menu-item ${isCustom ? 'selected' : ''}" role="option" aria-selected="${isCustom}" data-preset-id="custom">
          <div class="active-preset-item-main">
            <span class="active-preset-item-name">${customLabel}</span>
          </div>
          <span class="active-preset-item-dims">${curW}×${curH}</span>
          ${isCustom ? '<i class="fa-solid fa-check active-preset-item-check" aria-hidden="true"></i>' : ''}
        </div>
      </div>
    </div>`;

    menu.innerHTML = html;

    // Attach click listeners to each menu item
    menu.querySelectorAll('.active-preset-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const presetId = item.getAttribute('data-preset-id');
        this.selectPresetFromDropdown(presetId);
      });
    });
  }

  fitActivePresetPillText() {
    const pill = document.getElementById('activePresetPill');
    const label = document.getElementById('activePresetLabel');
    if (!pill || !label) return;

    if (window.innerWidth > 640) {
      label.style.fontSize = '';
      return;
    }

    // On mobile devices: dynamically adjust font size so text covers exactly 1 line without wrapping or clipping
    label.style.fontSize = '';
    const star = pill.querySelector('.fa-star');
    const chevron = pill.querySelector('.active-preset-chevron');
    const starW = star ? star.getBoundingClientRect().width : 16;
    const chevronW = chevron ? chevron.getBoundingClientRect().width : 12;
    const pillW = pill.clientWidth;
    const availableW = pillW - starW - chevronW - 32;

    if (availableW > 60) {
      let size = 12.5;
      label.style.fontSize = `${size}px`;
      while (label.scrollWidth > availableW && size > 9.5) {
        size -= 0.5;
        label.style.fontSize = `${size}px`;
      }
    }
  }

  updateActivePresetPill(preset) {
    if (!preset) return;
    const pill = document.getElementById('activePresetPill');
    const label = document.getElementById('activePresetLabel');
    const menu = document.getElementById('activePresetDropdownMenu');
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

    if (menu && !menu.classList.contains('hidden')) {
      this.populateActivePresetDropdown();
    }

    this.fitActivePresetPillText();
  }

  selectPresetBySpec(spec) {
    const match = (spec.preset && PRESETS.find(p => p.id === spec.preset)) ||
                  PRESETS.find(p => p.w === spec.w && p.h === spec.h) || {
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

  applyPreset(preset, { skipProcessing = false } = {}) {
    this.haptic(15);
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

    if (this.sourceData && !skipProcessing) {
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
    this.lastComputedCrop = null;
    this.autoFixes = {
      rotationDeg: 0,
      tiltDeg: 0,
      enhanced: false
    };
    this.manualEditorOpenedForFile = false;
  }

  async autoDetectAndAdjustPreset() {
    if (!this.sourceData || !this.currentPreset) return;
    const { workingCanvas, fullCanvas, workingScale } = this.sourceData;

    try {
      const currentKind = this.currentPreset.kind;

      // 1. First classify image content (color entropy, skin tones, bright paper & stroke density)
      const detectedKind = classifyImageContent(workingCanvas);

      if (detectedKind === 'signature') {
        if (currentKind === 'photo') {
          let targetPresetId = 'gov_sig_300x80';
          if (this.currentPreset.category === 'duet' || this.currentPreset.id?.includes('duet')) {
            targetPresetId = 'duet_sig_250x50';
          }
          const match = PRESETS.find(p => p.id === targetPresetId);
          if (match) {
            this.applyPreset(match, { skipProcessing: true });
            this.addChip({
              id: 'chip-auto-kind',
              label: t('chipAutoSig') || 'Signature detected — switched to Signature preset',
              isUndoable: false
            });
          }
        }
        return;
      }

      // 2. Strict face detection check (with anatomical keypoints & skin-tone verification)
      let hasFace = false;
      try {
        const faceDetection = await detectFacesWithLadder(workingCanvas, fullCanvas, workingScale);
        hasFace = faceDetection && faceDetection.success && faceDetection.faces && faceDetection.faces.length > 0;
      } catch (e) {
        hasFace = false;
      }

      // If a verified face is found -> switched to Photo preset
      if (hasFace) {
        if (currentKind === 'signature') {
          let targetPresetId = 'gov_photo_300x300';
          if (this.currentPreset.category === 'duet' || this.currentPreset.id?.includes('duet')) {
            targetPresetId = 'duet_photo_250x250';
          }
          const match = PRESETS.find(p => p.id === targetPresetId);
          if (match) {
            this.applyPreset(match, { skipProcessing: true });
            this.addChip({
              id: 'chip-auto-kind',
              label: t('chipAutoPhoto') || 'Face detected — switched to Photo preset',
              isUndoable: false
            });
          }
        }
      } else if (detectedKind === 'photo' && currentKind === 'signature') {
        let targetPresetId = 'gov_photo_300x300';
        if (this.currentPreset.category === 'duet' || this.currentPreset.id?.includes('duet')) {
          targetPresetId = 'duet_photo_250x250';
        }
        const match = PRESETS.find(p => p.id === targetPresetId);
        if (match) {
          this.applyPreset(match, { skipProcessing: true });
          this.addChip({
            id: 'chip-auto-kind',
            label: t('chipAutoPhoto') || 'Photo detected — switched to Photo preset',
            isUndoable: false
          });
        }
      }
    } catch (e) {
      console.warn('Auto-detect preset kind error:', e);
    }
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
      await this.autoDetectAndAdjustPreset();
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

    if (isBusy) {
      document.title = `⟳ (${text || t('processing')}) — ${CONFIG.SITE_NAME}`;
    } else if (this.currentExport && this.currentPreset) {
      document.title = `✓ ${CONFIG.SITE_NAME} — ${this.currentPreset.label} (${this.currentPreset.w}×${this.currentPreset.h})`;
    } else {
      document.title = `${CONFIG.SITE_NAME} — Photo & Signature Auto-Formatter (100% Free & Client-Side)`;
    }
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
      const btnHold = document.getElementById('btnHoldCompare');
      if (btnHold) btnHold.disabled = false;
      this.saveSession();
    } catch (err) {
      console.error('Export guarantee failed:', err);
      this.updateStatusReadout(false, err.message);
      document.getElementById('btnDownload').disabled = true;
      document.getElementById('btnCopyClipboard').disabled = true;
      const btnHold = document.getElementById('btnHoldCompare');
      if (btnHold) btnHold.disabled = true;
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
    this.haptic(20);
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
    this.haptic([25, 40, 25]);
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
    if (this.editor) {
      this.editor.close();
    }
    this.sourceData = null;
    this.exactCanvas = null;
    this.currentExport = null;
    this.lastBeforeState = null;
    this.hasDownloadedCurrentWork = false;
    this.resetUserTransforms();

    const btnHold = document.getElementById('btnHoldCompare');
    if (btnHold) btnHold.disabled = true;
    const comparingBadge = document.getElementById('comparingBadge');
    if (comparingBadge) comparingBadge.classList.add('hidden');

    this.customOptions.zoom2x = false;
    const zoomToggleBtn = document.getElementById('btnToggleZoom');
    if (zoomToggleBtn) {
      zoomToggleBtn.classList.remove('active');
      this.updateZoomBtnText(false);
    }
    const afterVp = document.getElementById('afterViewport');
    if (afterVp) afterVp.classList.remove('zoom-2x');

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
      this.showToast(t('copied'), 'success');
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    } catch (e) {
      console.warn('Clipboard copy failed:', e);
      this.showToast(t('copyFailed'), 'error');
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

