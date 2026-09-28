// js/bg.js - Client-Side Background Removal with MediaPipe ImageSegmenter and Sanity Gate
import { createCanvas } from './loader.js';

let segmenterInstance = null;
let isSegmenterLoading = false;
let segmenterFailed = false;

/**
 * Lazy load MediaPipe ImageSegmenter using self-hosted vendor files
 */
export async function getSegmenter() {
  if (segmenterInstance) return segmenterInstance;
  if (segmenterFailed) return null;

  isSegmenterLoading = true;
  try {
    const { FilesetResolver, ImageSegmenter } = await import('../vendor/mediapipe/vision_bundle.mjs');
    const wasmResolver = await FilesetResolver.forVisionTasks('./vendor/mediapipe/wasm');

    try {
      segmenterInstance = await ImageSegmenter.createFromOptions(wasmResolver, {
        baseOptions: {
          modelAssetPath: './vendor/mediapipe/selfie_segmenter.tflite',
          delegate: 'GPU'
        },
        runningMode: 'IMAGE',
        outputCategoryMask: false,
        outputConfidenceMasks: true
      });
    } catch (gpuError) {
      console.warn('ImageSegmenter GPU delegate failed, falling back to CPU:', gpuError);
      segmenterInstance = await ImageSegmenter.createFromOptions(wasmResolver, {
        baseOptions: {
          modelAssetPath: './vendor/mediapipe/selfie_segmenter.tflite',
          delegate: 'CPU'
        },
        runningMode: 'IMAGE',
        outputCategoryMask: false,
        outputConfidenceMasks: true
      });
    }

    isSegmenterLoading = false;
    return segmenterInstance;
  } catch (err) {
    console.error('Failed to load MediaPipe ImageSegmenter:', err);
    segmenterFailed = true;
    isSegmenterLoading = false;
    return null;
  }
}

/**
 * Remove background and replace with pure white (#FFFFFF), gated by sanity checks
 * 
 * @param {HTMLCanvasElement} inputCanvas
 * @param {{ x: number, y: number } | null} [faceCenter] Normalized (0..1) or pixel coords of face center
 * @returns {Promise<{
 *   canvas: HTMLCanvasElement,
 *   skipped: boolean,
 *   reason?: string,
 *   areaFraction?: number
 * }>}
 */
export async function removeBackgroundToWhite(inputCanvas, faceCenter = null) {
  const segmenter = await getSegmenter();
  if (!segmenter) {
    return { canvas: inputCanvas, skipped: true, reason: 'MODEL_UNAVAILABLE' };
  }

  const w = inputCanvas.width;
  const h = inputCanvas.height;

  // Downscale if needed for fast segmentation (max 768px)
  let segCanvas = inputCanvas;
  const maxDim = Math.max(w, h);
  if (maxDim > 768) {
    const scale = 768 / maxDim;
    const sw = Math.round(w * scale);
    const sh = Math.round(h * scale);
    segCanvas = createCanvas(sw, sh);
    const sCtx = segCanvas.getContext('2d');
    sCtx.drawImage(inputCanvas, 0, 0, sw, sh);
  }

  let result;
  try {
    result = segmenter.segment(segCanvas);
  } catch (err) {
    console.error('Segmentation inference failed:', err);
    return { canvas: inputCanvas, skipped: true, reason: 'INFERENCE_FAILED' };
  }

  if (!result || !result.confidenceMasks || result.confidenceMasks.length === 0) {
    return { canvas: inputCanvas, skipped: true, reason: 'NO_MASK' };
  }

  const mask = result.confidenceMasks[0];
  try {
    const maskW = mask.width;
    const maskH = mask.height;
    const maskData = mask.getAsFloat32Array();
    const totalPixels = maskW * maskH;

    // 1. Sanity Gate: Area check (10% to 85% of frame)
    let fgPixels = 0;
    for (let i = 0; i < totalPixels; i++) {
      if (maskData[i] >= 0.5) fgPixels++;
    }
    const areaFraction = fgPixels / totalPixels;

    if (areaFraction < 0.10 || areaFraction > 0.85) {
      return {
        canvas: inputCanvas,
        skipped: true,
        reason: 'AREA_OUT_OF_BOUNDS',
        areaFraction
      };
    }

    // 2. Sanity Gate: Face center containment
    if (faceCenter) {
      let fx = faceCenter.x;
      let fy = faceCenter.y;
      // If coordinates are in pixels relative to inputCanvas, normalize them
      if (fx > 1 || fy > 1) {
        fx /= w;
        fy /= h;
      }
      const mx = Math.max(0, Math.min(maskW - 1, Math.round(fx * maskW)));
      const my = Math.max(0, Math.min(maskH - 1, Math.round(fy * maskH)));
      const faceConfidence = maskData[my * maskW + mx];

      if (faceConfidence < 0.35) {
        return {
          canvas: inputCanvas,
          skipped: true,
          reason: 'FACE_NOT_IN_MASK',
          areaFraction
        };
      }
    }

    // 3. Render mask to an alpha canvas at mask resolution
    const maskCanvas = createCanvas(maskW, maskH);
    const mCtx = maskCanvas.getContext('2d');
    const mImgData = mCtx.createImageData(maskW, maskH);
    const md = mImgData.data;

    for (let i = 0; i < totalPixels; i++) {
      const val = maskData[i];
      // Fast guided refinement & threshold curve (erode ~1px, feather ~1.5px)
      const alpha = Math.max(0, Math.min(1, (val - 0.15) / 0.75));
      const smoothed = alpha * alpha * (3 - 2 * alpha);
      const byteVal = Math.round(smoothed * 255);

      const idx = i * 4;
      md[idx] = byteVal;
      md[idx + 1] = byteVal;
      md[idx + 2] = byteVal;
      md[idx + 3] = byteVal;
    }
    mCtx.putImageData(mImgData, 0, 0);

    // 4. Upsample mask to inputCanvas resolution with bilinear interpolation
    const fullMaskCanvas = createCanvas(w, h);
    const fmCtx = fullMaskCanvas.getContext('2d');
    fmCtx.imageSmoothingEnabled = true;
    fmCtx.imageSmoothingQuality = 'high';
    fmCtx.drawImage(maskCanvas, 0, 0, w, h);

    const fullMaskData = fmCtx.getImageData(0, 0, w, h).data;

    // 5. Composite over pure #FFFFFF with edge decontamination
    const outCanvas = createCanvas(w, h);
    const outCtx = outCanvas.getContext('2d');
    const srcCtx = inputCanvas.getContext('2d', { willReadFrequently: true });
    const srcData = srcCtx.getImageData(0, 0, w, h).data;

    const outImgData = outCtx.createImageData(w, h);
    const outData = outImgData.data;

    for (let i = 0; i < srcData.length; i += 4) {
      const a = fullMaskData[i] / 255; // 0..1

      if (a >= 0.99) {
        // Full foreground
        outData[i] = srcData[i];
        outData[i + 1] = srcData[i + 1];
        outData[i + 2] = srcData[i + 2];
        outData[i + 3] = 255;
      } else if (a <= 0.01) {
        // Pure white background
        outData[i] = 255;
        outData[i + 1] = 255;
        outData[i + 2] = 255;
        outData[i + 3] = 255;
      } else {
        // Boundary blending with white decontamination to eliminate dark halos
        const invA = 1 - a;
        outData[i] = Math.round(srcData[i] * a + 255 * invA);
        outData[i + 1] = Math.round(srcData[i + 1] * a + 255 * invA);
        outData[i + 2] = Math.round(srcData[i + 2] * a + 255 * invA);
        outData[i + 3] = 255;
      }
    }

    outCtx.putImageData(outImgData, 0, 0);
    return {
      canvas: outCanvas,
      skipped: false,
      areaFraction
    };
  } finally {
    try {
      mask.close();
    } catch (e) {}
  }
}
