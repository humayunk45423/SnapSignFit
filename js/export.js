// js/export.js - Exact dimension resizing, Size Guarantee Ladder, Self-Verification, and Export
import { createCanvas, stepDownDownscale } from './loader.js';
import { CONFIG } from './i18n.js';

let upngLoaded = false;

// mozjpeg WASM baseline encoder state
let mozjpegEncodeModule = null;
let mozjpegLoading = false;
let mozjpegFailed = false;

/**
 * Lazy-init mozjpeg WASM encoder (baseline JPEG only - no SOF2 markers)
 */
async function getMozjpegEncoder() {
  if (mozjpegEncodeModule) return mozjpegEncodeModule;
  if (mozjpegFailed) return null;
  if (mozjpegLoading) {
    // Wait for existing load
    await new Promise(res => setTimeout(res, 50));
    return mozjpegEncodeModule || null;
  }
  mozjpegLoading = true;
  try {
    const { default: encode, init } = await import('../vendor/jsquash-jpeg/encode.js');
    await init();
    mozjpegEncodeModule = encode;
    mozjpegLoading = false;
    return mozjpegEncodeModule;
  } catch (err) {
    console.warn('mozjpeg WASM init failed, will use canvas.toBlob:', err);
    mozjpegFailed = true;
    mozjpegLoading = false;
    return null;
  }
}

/**
 * Encode canvas as STRICT BASELINE JPEG (no SOF2, no EXIF, no ICC)
 * Falls back to canvas.toBlob if WASM unavailable
 */
async function canvasToJpegBlob(canvas, quality = 0.85) {
  try {
    const encode = await getMozjpegEncoder();
    if (encode) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // Clamp quality to 1-100 integer for mozjpeg
      const q = Math.max(1, Math.min(100, Math.round(quality * 100)));
      const arrayBuffer = await encode(imageData, {
        quality: q,
        baseline: true,
        progressive: false,
        optimize_coding: true
      });
      return new Blob([arrayBuffer], { type: 'image/jpeg' });
    }
  } catch (err) {
    console.warn('mozjpeg encode failed, using canvas fallback:', err);
  }
  // Fallback
  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', quality));
}

/**
 * Lazy load pako and UPNG if not already on window
 */
export async function loadUPNG() {
  if (window.UPNG && window.pako) return window.UPNG;
  return new Promise((resolve, reject) => {
    const loadPako = window.pako ? Promise.resolve() : new Promise((res, rej) => {
      const ps = document.createElement('script');
      ps.src = './vendor/pako.min.js';
      ps.onload = res;
      ps.onerror = rej;
      document.head.appendChild(ps);
    });

    loadPako.then(() => {
      const script = document.createElement('script');
      script.src = './vendor/UPNG.js';
      script.onload = () => {
        upngLoaded = true;
        resolve(window.UPNG);
      };
      script.onerror = () => reject(new Error('Failed to load UPNG module.'));
      document.head.appendChild(script);
    }).catch(reject);
  });
}

/**
 * Helper to get blob from canvas with specific format & quality
 */
function canvasToBlob(canvas, mimeType, quality) {
  if (mimeType === 'image/jpeg') {
    return canvasToJpegBlob(canvas, quality);
  }
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), mimeType, quality);
  });
}

/**
 * Apply 0.5 - 1.0 px subtle Gaussian denoise blur on target canvas
 */
function applyDenoise(canvas, radius = 0.8) {
  const w = canvas.width;
  const h = canvas.height;
  const out = createCanvas(w, h);
  const ctx = out.getContext('2d');
  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(canvas, 0, 0);
  return out;
}

/**
 * Convert canvas to grayscale
 */
function convertToGrayscale(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const out = createCanvas(w, h);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0);

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const luma = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = luma;
    d[i + 1] = luma;
    d[i + 2] = luma;
  }
  ctx.putImageData(imgData, 0, 0);
  return out;
}

/**
 * Binary search for best JPEG / WebP quality fitting within maxBytes
 */
async function binarySearchQuality(canvas, mimeType, maxBytes, minQ = 0.30, maxQ = 1.0, iterations = 10) {
  let low = minQ;
  let high = maxQ;
  let bestBlob = null;
  let bestQuality = low;

  for (let i = 0; i < iterations; i++) {
    const mid = (low + high) / 2;
    const blob = await canvasToBlob(canvas, mimeType, mid);
    if (!blob) break;

    if (blob.size <= maxBytes) {
      bestBlob = blob;
      bestQuality = mid;
      low = mid; // Try for higher quality
    } else {
      high = mid; // Too large, lower quality
    }
  }

  // Final check at low boundary
  if (!bestBlob) {
    const testLow = await canvasToBlob(canvas, mimeType, minQ);
    if (testLow && testLow.size <= maxBytes) {
      bestBlob = testLow;
      bestQuality = minQ;
    }
  }

  return { blob: bestBlob, quality: bestQuality };
}

/**
 * PNG Size Guarantee via UPNG quantization
 */
async function runPNGLadder(canvas, maxBytes) {
  await loadUPNG();
  const UPNG = window.UPNG;
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, w, h);
  const rgbaBuffer = imgData.data.buffer;

  // Step 1: Lossless full colors
  const fullRes = UPNG.encode([rgbaBuffer], w, h, 0);
  let blob = new Blob([fullRes], { type: 'image/png' });
  if (blob.size <= maxBytes) {
    return { blob, format: 'png', fallback: false };
  }

  // Step 2: Quantize palette: 256 -> 128 -> 64 -> 32 -> 16 -> 8
  const paletteSteps = [256, 128, 64, 32, 16, 8];
  for (const cnum of paletteSteps) {
    const qBuffer = UPNG.encode([rgbaBuffer], w, h, cnum);
    blob = new Blob([qBuffer], { type: 'image/png' });
    if (blob.size <= maxBytes) {
      return { blob, format: 'png', fallback: false, quantizedColors: cnum };
    }
  }

  // Step 3: PNG still exceeds maxBytes -> auto-switch to JPG with visible notice
  return { blob: null, format: 'png', needsFallback: true };
}

/**
 * JPG / WebP Size Guarantee Ladder (§11)
 * (1) Binary search 1.0 -> 0.30 (>= 10 iterations)
 * (2) Continue down to 0.05
 * (3) 0.5-1px Gaussian denoise at target size and repeat 1-2
 * (4) Grayscale conversion (with notice) and repeat
 */
async function runLossyLadder(canvas, mimeType, maxBytes) {
  let activeCanvas = canvas;
  let notices = [];

  // Ladder Step 1: Binary search 1.0 -> 0.30 (>= 10 iterations)
  let { blob } = await binarySearchQuality(activeCanvas, mimeType, maxBytes, 0.30, 1.0, 12);
  if (blob && blob.size <= maxBytes) {
    return { blob, notices };
  }

  // Ladder Step 2: Quality down to 0.05
  let resLow = await binarySearchQuality(activeCanvas, mimeType, maxBytes, 0.05, 0.30, 8);
  if (resLow.blob && resLow.blob.size <= maxBytes) {
    return { blob: resLow.blob, notices };
  }

  // Ladder Step 3: Subtle Gaussian denoise
  activeCanvas = applyDenoise(activeCanvas, 0.8);
  let resDenoise = await binarySearchQuality(activeCanvas, mimeType, maxBytes, 0.05, 0.95, 10);
  if (resDenoise.blob && resDenoise.blob.size <= maxBytes) {
    return { blob: resDenoise.blob, notices };
  }

  // Ladder Step 4: Grayscale conversion
  activeCanvas = convertToGrayscale(activeCanvas);
  notices.push('warnGrayscale');
  let resGray = await binarySearchQuality(activeCanvas, mimeType, maxBytes, 0.05, 0.95, 10);
  if (resGray.blob && resGray.blob.size <= maxBytes) {
    return { blob: resGray.blob, notices };
  }

  return { blob: null, notices };
}

/**
 * Self-verification step (§11):
 * Decode produced blob with createImageBitmap;
 * assert width === targetW && height === targetH AND blob.size <= maxBytes (gov: < 100000).
 */
export async function verifyExportBlob(blob, targetW, targetH, maxBytes, isGov = false) {
  if (!blob) return { valid: false, error: 'NO_BLOB' };

  // Strict byte limit check
  if (blob.size > maxBytes) {
    return { valid: false, error: 'SIZE_EXCEEDED', size: blob.size, maxBytes };
  }
  if (isGov && blob.size >= 100000) {
    return { valid: false, error: 'GOV_SIZE_EXCEEDED', size: blob.size };
  }

  // Dimension check
  try {
    const bitmap = await createImageBitmap(blob);
    const validDims = (bitmap.width === targetW && bitmap.height === targetH);
    bitmap.close();

    if (!validDims) {
      return { valid: false, error: 'DIMENSION_MISMATCH' };
    }
  } catch (e) {
    // If browser lacks createImageBitmap for format, fallback to Image decode
    const valid = await new Promise(resolve => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img.naturalWidth === targetW && img.naturalHeight === targetH);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(false);
      };
      img.src = url;
    });
    if (!valid) return { valid: false, error: 'DIMENSION_MISMATCH' };
  }

  return { valid: true, size: blob.size };
}

/**
 * Master Export Pipeline
 * 
 * @param {HTMLCanvasElement} exactCanvas - Canvas already rendered at EXACT target dimensions
 * @param {number} targetW
 * @param {number} targetH
 * @param {Object} options
 * @param {string} [options.format='jpg']
 * @param {number} [options.maxKB=99]
 * @param {boolean} [options.locked=false]
 * @param {string} [options.presetKind='photo']
 * @returns {Promise<{
 *   blob: Blob,
 *   size: number,
 *   format: string,
 *   notices: string[],
 *   url: string,
 *   filename: string
 * }>}
 */
export async function exportWithGuarantee(exactCanvas, targetW, targetH, options = {}) {
  const {
    format = 'jpg',
    maxKB = 99,
    locked = false,
    presetKind = 'photo'
  } = options;

  // Max bytes rule: locked gov presets strictly capped at 99,000 bytes
  let maxBytes;
  if (locked) {
    // Lowered limit allowed, but never above 99,000 bytes
    maxBytes = Math.min(CONFIG.DEFAULT_MAX_BYTES_GOV, Math.round((maxKB || 99) * 1000));
  } else if (!maxKB || maxKB <= 0) {
    maxBytes = 200 * 1024 * 1024; // No limit
  } else {
    maxBytes = Math.round(maxKB * 1000);
  }

  let chosenFormat = format.toLowerCase();
  let notices = [];
  let finalBlob = null;

  // Helper retry runner
  async function runLadderAttempt(curFmt) {
    if (curFmt === 'png') {
      const pngRes = await runPNGLadder(exactCanvas, maxBytes);
      if (pngRes.blob) {
        return { blob: pngRes.blob, format: 'png' };
      }
      if (pngRes.needsFallback) {
        notices.push('warnPngConvertedJpg');
        const fallbackRes = await runLossyLadder(exactCanvas, 'image/jpeg', maxBytes);
        return { blob: fallbackRes.blob, format: 'jpg', notices: fallbackRes.notices };
      }
    } else {
      const mime = curFmt === 'webp' ? 'image/webp' : 'image/jpeg';
      const lossyRes = await runLossyLadder(exactCanvas, mime, maxBytes);
      return { blob: lossyRes.blob, format: curFmt, notices: lossyRes.notices };
    }
    return { blob: null, format: curFmt };
  }

  // Attempt 1
  let res = await runLadderAttempt(chosenFormat);
  finalBlob = res.blob;
  chosenFormat = res.format;
  if (res.notices) notices.push(...res.notices);

  // Self-verification
  let verification = await verifyExportBlob(finalBlob, targetW, targetH, maxBytes, locked);

  // If verification failed, retry ladder once
  if (!verification.valid) {
    console.warn('First export attempt verification failed:', verification.error, 'retrying once...');
    res = await runLadderAttempt('jpg'); // Fallback to JPG on retry
    finalBlob = res.blob;
    chosenFormat = res.format;
    if (res.notices) notices.push(...res.notices);
    verification = await verifyExportBlob(finalBlob, targetW, targetH, maxBytes, locked);
  }

  if (!verification.valid) {
    throw new Error('SIZE_OR_DIMENSION_LIMIT_UNMET');
  }

  // Produce download URL and standardized filename
  const url = URL.createObjectURL(finalBlob);
  const ext = chosenFormat === 'webp' ? 'webp' : (chosenFormat === 'png' ? 'png' : 'jpg');
  const filename = `snapsignfit_${presetKind}_${targetW}x${targetH}.${ext}`;

  return {
    blob: finalBlob,
    size: finalBlob.size,
    format: chosenFormat,
    notices: [...new Set(notices)],
    url,
    filename
  };
}

/**
 * Trigger browser file download
 */
export function triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
  }, 100);
}

/**
 * Copy image blob to clipboard (PNG supported)
 */
export async function copyToClipboard(blob) {
  if (!navigator.clipboard || !window.ClipboardItem) {
    throw new Error('Clipboard API not supported in this browser.');
  }

  // Most browsers only support image/png in clipboard
  let pngBlob = blob;
  if (blob.type !== 'image/png') {
    const bitmap = await createImageBitmap(blob);
    const canvas = createCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    pngBlob = await canvasToBlob(canvas, 'image/png', 1.0);
  }

  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': pngBlob })
  ]);
}
