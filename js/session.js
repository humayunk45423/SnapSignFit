// js/session.js - Complete Session Persistence (IndexedDB for all canvases, localStorage for settings)
// Saves and restores 100% of the user's progress across reloads (source image, manual brush/erased background,
// crop frames, straighten/rotations, and all adjustment settings).

const DB_NAME = 'SnapSignFitSession';
const DB_VERSION = 1;
const STORE_IMAGE = 'sessionImage';
const LS_KEY = 'snapsignfit_session_v1';

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_IMAGE)) {
        db.createObjectStore(STORE_IMAGE);
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Save an HTML5 Canvas into IndexedDB as a PNG blob under a specific key.
 * @param {string} key
 * @param {HTMLCanvasElement} canvas
 */
export async function saveSessionCanvas(key, canvas) {
  if (!canvas) return;
  try {
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) return;
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_IMAGE, 'readwrite');
      tx.objectStore(STORE_IMAGE).put(blob, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn(`[Session] Failed to save canvas '${key}':`, err);
  }
}

/**
 * Remove a canvas key from IndexedDB.
 * @param {string} key
 */
export async function removeSessionCanvas(key) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_IMAGE, 'readwrite');
      tx.objectStore(STORE_IMAGE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn(`[Session] Failed to remove canvas '${key}':`, err);
  }
}

/**
 * Load a canvas from IndexedDB.
 * @param {string} key
 * @returns {Promise<HTMLCanvasElement|null>}
 */
export async function loadSessionCanvas(key) {
  try {
    const db = await openDB();
    const blob = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_IMAGE, 'readonly');
      const req = tx.objectStore(STORE_IMAGE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (!blob) return null;
    const img = await new Promise((resolve) => {
      const el = new Image();
      const url = URL.createObjectURL(blob);
      el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
      el.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      el.src = url;
    });
    if (!img) return null;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return canvas;
  } catch (err) {
    console.warn(`[Session] Failed to load canvas '${key}':`, err);
    return null;
  }
}

/**
 * Save the source canvas (convenience wrapper).
 * @param {HTMLCanvasElement} canvas
 */
export async function saveSessionImage(canvas) {
  return saveSessionCanvas('source', canvas);
}

/**
 * Load the source canvas (convenience wrapper).
 * @returns {Promise<HTMLCanvasElement|null>}
 */
export async function loadSessionImage() {
  return loadSessionCanvas('source');
}

/**
 * Clear all saved canvas data from IndexedDB.
 */
export async function clearSessionImage() {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_IMAGE, 'readwrite');
      tx.objectStore(STORE_IMAGE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[Session] Failed to clear session canvases:', err);
  }
}

/**
 * Save complete session state (presets, transforms, options, flags) to localStorage.
 * @param {object} state
 */
export function saveSessionState(state) {
  try {
    const serialisable = {
      presetId: state.presetId,
      category: state.category,
      fileName: state.fileName,
      customOptions: state.customOptions,
      userTransforms: {
        crop: state.userTransforms?.crop || null,
        rotation: state.userTransforms?.rotation || 0,
        straightenDeg: state.userTransforms?.straightenDeg || 0,
        flipH: state.userTransforms?.flipH || false,
        flipV: state.userTransforms?.flipV || false,
        allowPadding: state.userTransforms?.allowPadding || false,
        step2Transform: state.userTransforms?.step2Transform || null,
        hasTransformedCanvas: Boolean(state.userTransforms?.transformedCanvas),
        hasMaskCanvas: Boolean(state.userTransforms?.maskCanvas),
        hasCroppedCanvas: Boolean(state.userTransforms?.croppedCanvas)
      },
      autoFixes: state.autoFixes || { rotationDeg: 0, tiltDeg: 0, enhanced: false },
      timestamp: Date.now()
    };
    localStorage.setItem(LS_KEY, JSON.stringify(serialisable));
  } catch (err) {
    console.warn('[Session] Failed to save state:', err);
  }
}

/**
 * Load session state from localStorage.
 * @returns {object|null}
 */
export function loadSessionState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    // Expire sessions older than 7 days
    if (!state.timestamp || Date.now() - state.timestamp > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(LS_KEY);
      return null;
    }
    return state;
  } catch (err) {
    console.warn('[Session] Failed to load state:', err);
    return null;
  }
}

/**
 * Clear all session data (both localStorage and IndexedDB).
 */
export async function clearSession() {
  try { localStorage.removeItem(LS_KEY); } catch (e) {}
  await clearSessionImage();
}
