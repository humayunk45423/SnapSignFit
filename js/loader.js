// js/loader.js - Bulletproof image loading, format detection by magic bytes, EXIF, and preprocessing

const MAX_FILE_SIZE = 40 * 1024 * 1024; // 40 MB
const MIN_DIMENSION = 32;
const MAX_FULLRES_SIDE = 4096; // iOS & mobile canvas safety cap
const MAX_WORKING_SIDE = 2048; // Fast analysis copy

let heic2anyLoaded = false;

/**
 * Detect image format from binary magic bytes
 * @param {Uint8Array} bytes 
 * @returns {string} 'jpeg' | 'png' | 'gif' | 'webp' | 'bmp' | 'tiff' | 'heic' | 'avif' | 'svg' | 'unknown'
 */
export function detectFormatByMagicBytes(bytes) {
  if (!bytes || bytes.length < 4) return 'unknown';

  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
      bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A) {
    return 'png';
  }

  // GIF: GIF87a or GIF89a (47 49 46 38 37 61 or 47 49 46 38 39 61)
  if (bytes.length >= 6 &&
      bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'gif';
  }

  // BMP: BM (42 4D)
  if (bytes[0] === 0x42 && bytes[1] === 0x4D) {
    return 'bmp';
  }

  // WebP: RIFF .... WEBP
  if (bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'webp';
  }

  // TIFF: II*. (49 49 2A 00) or MM.* (4D 4D 00 2A)
  if (bytes.length >= 4 &&
      ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A && bytes[3] === 0x00) ||
       (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00 && bytes[3] === 0x2A))) {
    return 'tiff';
  }

  // ISO Base Media File Format (HEIC, AVIF): ftyp at offset 4..7
  if (bytes.length >= 12 &&
      bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
    if (brand.startsWith('avif') || brand.startsWith('avis')) {
      return 'avif';
    }
    if (brand.startsWith('heic') || brand.startsWith('heix') || brand.startsWith('hevc') ||
        brand.startsWith('mif1') || brand.startsWith('msf1')) {
      return 'heic';
    }
    // Also check compatible brands in subsequent bytes if available
    const headerStr = Array.from(bytes.slice(8, Math.min(bytes.length, 32)))
      .map(b => String.fromCharCode(b)).join('').toLowerCase();
    if (headerStr.includes('avif')) return 'avif';
    if (headerStr.includes('heic') || headerStr.includes('mif1')) return 'heic';
  }

  // SVG: ASCII check for <svg or <?xml
  const previewStr = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.slice(0, Math.min(bytes.length, 256)))
    .trimStart().toLowerCase();
  if (previewStr.startsWith('<svg') || previewStr.startsWith('<?xml')) {
    return 'svg';
  }

  return 'unknown';
}

/**
 * Lazy load heic2any script if needed
 */
async function loadHeic2Any() {
  if (heic2anyLoaded && window.heic2any) return window.heic2any;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = './vendor/heic2any.min.js';
    script.onload = () => {
      heic2anyLoaded = true;
      resolve(window.heic2any);
    };
    script.onerror = () => reject(new Error('Failed to load HEIC decoder module.'));
    document.head.appendChild(script);
  });
}

/**
 * Lazy load UTIF script if needed
 */
async function loadUTIF() {
  if (window.UTIF) return window.UTIF;
  return new Promise((resolve, reject) => {
    // Pako first if not present
    const loadPako = window.pako ? Promise.resolve() : new Promise((res, rej) => {
      const ps = document.createElement('script');
      ps.src = './vendor/pako.min.js';
      ps.onload = res;
      ps.onerror = rej;
      document.head.appendChild(ps);
    });

    loadPako.then(() => {
      const script = document.createElement('script');
      script.src = './vendor/UTIF.js';
      script.onload = () => resolve(window.UTIF);
      script.onerror = () => reject(new Error('Failed to load TIFF decoder module.'));
      document.head.appendChild(script);
    }).catch(reject);
  });
}

/**
 * Step-down halving downscale to avoid aliasing artifacts
 */
export function stepDownDownscale(sourceCanvas, targetW, targetH) {
  const safeTargetW = Math.max(1, Math.round(targetW || 1));
  const safeTargetH = Math.max(1, Math.round(targetH || 1));
  if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height || sourceCanvas.width <= 0 || sourceCanvas.height <= 0) {
    return createCanvas(safeTargetW, safeTargetH);
  }
  let curW = sourceCanvas.width;
  let curH = sourceCanvas.height;
  let curCanvas = sourceCanvas;

  while (curW / 2 >= safeTargetW && curH / 2 >= safeTargetH) {
    const nextW = Math.max(1, Math.floor(curW / 2));
    const nextH = Math.max(1, Math.floor(curH / 2));
    if (nextW <= 0 || nextH <= 0) break;
    const stepCanvas = createCanvas(nextW, nextH);
    const ctx = stepCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(curCanvas, 0, 0, nextW, nextH);
    curCanvas = stepCanvas;
    curW = nextW;
    curH = nextH;
  }

  const finalCanvas = createCanvas(safeTargetW, safeTargetH);
  const finalCtx = finalCanvas.getContext('2d');
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';
  if (curCanvas && curCanvas.width > 0 && curCanvas.height > 0) {
    finalCtx.drawImage(curCanvas, 0, 0, safeTargetW, safeTargetH);
  }
  return finalCanvas;
}

/**
 * Helper to create canvas (OffscreenCanvas when in workers or preferred, or standard)
 */
export function createCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  return canvas;
}

/**
 * Flatten image transparency onto a solid color (default white)
 */
export function flattenAlpha(sourceCanvas, bgColor = '#ffffff') {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const flatCanvas = createCanvas(w, h);
  const ctx = flatCanvas.getContext('2d', { willReadFrequently: true });
  
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(sourceCanvas, 0, 0);
  return flatCanvas;
}

/**
 * Main loader entry point
 * Accepts File or Blob, validates size & dimensions, handles all formats,
 * decodes with EXIF orientation, creates full-res and working copies.
 * 
 * @param {Blob|File} file
 * @param {string} [bgColor='#ffffff']
 * @returns {Promise<{
 *   fullCanvas: HTMLCanvasElement,
 *   workingCanvas: HTMLCanvasElement,
 *   workingScale: number,
 *   sourceWidth: number,
 *   sourceHeight: number,
 *   detectedFormat: string,
 *   fileName: string
 * }>}
 */
export async function loadImageFile(file, bgColor = '#ffffff') {
  if (!file || file.size === 0) {
    throw new Error('CORRUPT_IMAGE');
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('FILE_TOO_LARGE');
  }

  // Read header bytes to identify format
  const headerBuffer = await file.slice(0, 256).arrayBuffer();
  const headerBytes = new Uint8Array(headerBuffer);
  let detectedFormat = detectFormatByMagicBytes(headerBytes);
  const fileName = file.name || 'image';

  let rawBitmapOrImage = null;
  let sourceBlob = file;

  // Handle TIFF via UTIF
  if (detectedFormat === 'tiff') {
    const UTIF = await loadUTIF();
    const fullBuffer = await file.arrayBuffer();
    const ifds = UTIF.decode(fullBuffer);
    if (!ifds || ifds.length === 0) {
      throw new Error('CORRUPT_IMAGE');
    }
    UTIF.decodeImage(fullBuffer, ifds[0]);
    const rgba = UTIF.toRGBA8(ifds[0]);
    const tw = ifds[0].width;
    const th = ifds[0].height;
    const tCanvas = createCanvas(tw, th);
    const tCtx = tCanvas.getContext('2d');
    const imgData = tCtx.createImageData(tw, th);
    imgData.data.set(rgba);
    tCtx.putImageData(imgData, 0, 0);
    rawBitmapOrImage = tCanvas;
  }

  // Handle HEIC
  if (detectedFormat === 'heic') {
    // Try native decode first (some modern browsers / OS support it)
    try {
      rawBitmapOrImage = await createImageBitmap(sourceBlob, { imageOrientation: 'from-image' });
    } catch (e) {
      // Fallback to heic2any
      const heic2any = await loadHeic2Any();
      const convertedBlob = await heic2any({
        blob: sourceBlob,
        toType: 'image/jpeg',
        quality: 0.95
      });
      sourceBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
    }
  }

  // Standard decoders (JPEG, PNG, WebP, BMP, AVIF, GIF, SVG)
  if (!rawBitmapOrImage) {
    try {
      rawBitmapOrImage = await createImageBitmap(sourceBlob, { imageOrientation: 'from-image' });
    } catch (err) {
      // Fallback: <img> element decode
      rawBitmapOrImage = await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(sourceBlob);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('CORRUPT_IMAGE'));
        };
        img.src = url;
      });
    }
  }

  const srcW = rawBitmapOrImage.width || rawBitmapOrImage.naturalWidth;
  const srcH = rawBitmapOrImage.height || rawBitmapOrImage.naturalHeight;

  if (srcW < MIN_DIMENSION || srcH < MIN_DIMENSION) {
    if (typeof rawBitmapOrImage.close === 'function') rawBitmapOrImage.close();
    throw new Error('DIMENSION_TOO_SMALL');
  }

  // Build full-res canvas (capped at 4096 longest side for memory & iOS safety)
  let fullW = srcW;
  let fullH = srcH;
  const maxSrcSide = Math.max(srcW, srcH);
  if (maxSrcSide > MAX_FULLRES_SIDE) {
    const scale = MAX_FULLRES_SIDE / maxSrcSide;
    fullW = Math.round(srcW * scale);
    fullH = Math.round(srcH * scale);
  }

  const fullCanvas = createCanvas(fullW, fullH);
  const fullCtx = fullCanvas.getContext('2d', { willReadFrequently: true });
  fullCtx.fillStyle = bgColor;
  fullCtx.fillRect(0, 0, fullW, fullH);
  fullCtx.drawImage(rawBitmapOrImage, 0, 0, fullW, fullH);

  // Close raw ImageBitmap to free underlying GPU memory
  if (typeof rawBitmapOrImage.close === 'function') {
    rawBitmapOrImage.close();
  }

  // Build working canvas (downscale to max 2048 longest side for fast face/saliency analysis)
  let workingCanvas = fullCanvas;
  let workingScale = 1.0;
  const longestFull = Math.max(fullW, fullH);
  if (longestFull > MAX_WORKING_SIDE) {
    workingScale = MAX_WORKING_SIDE / longestFull;
    const workW = Math.round(fullW * workingScale);
    const workH = Math.round(fullH * workingScale);
    workingCanvas = stepDownDownscale(fullCanvas, workW, workH);
  }

  return {
    fullCanvas,
    workingCanvas,
    workingScale,
    sourceWidth: srcW,
    sourceHeight: srcH,
    detectedFormat,
    fileName
  };
}
