// js/session.js - Session Persistence (IndexedDB for image, localStorage for settings)
// Saves and restores the user's last image + all settings across page reloads.

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
 * Save the source canvas as a PNG blob into IndexedDB.
 * @param {HTMLCanvasElement} canvas
 */
export async function saveSessionImage(canvas) {
  try {
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_IMAGE, 'readwrite');
      tx.objectStore(STORE_IMAGE).put(blob, 'current');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[Session] Failed to save image:', err);
  }
}

/**
 * Load the saved source image from IndexedDB.
 * @returns {Promise<HTMLImageElement|null>}
 */
export async function loadSessionImage() {
  try {
    const db = await openDB();
    const blob = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_IMAGE, 'readonly');
      const req = tx.objectStore(STORE_IMAGE).get('current');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (!blob) return null;
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  } catch (err) {
    console.warn('[Session] Failed to load image:', err);
    return null;
  }
}

/**
 * Clear the saved image from IndexedDB.
 */
export async function clearSessionImage() {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_IMAGE, 'readwrite');
      tx.objectStore(STORE_IMAGE).delete('current');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[Session] Failed to clear image:', err);
  }
}

/**
 * Save all non-image session state to localStorage.
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
        allowPadding: state.userTransforms?.allowPadding || false
        // Note: transformedCanvas is NOT serialised (re-derived on restore)
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
 * Clear all session data.
 */
export async function clearSession() {
  try { localStorage.removeItem(LS_KEY); } catch (e) {}
  await clearSessionImage();
}
