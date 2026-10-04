// js/face.js - MediaPipe Face Detection, multi-pass retry ladder, quality checks, and passport crop math
import { CONFIG } from './i18n.js';
import { createCanvas } from './loader.js';
import { classifyImageContent } from './signature.js';

let faceDetectorInstance = null;
let isModelLoading = false;
let modelLoadFailed = false;

/**
 * Initialize MediaPipe FaceDetector with GPU delegate and CPU fallback
 */
export async function getFaceDetector(onProgress) {
  if (faceDetectorInstance) return faceDetectorInstance;
  if (modelLoadFailed) return null;

  isModelLoading = true;
  if (onProgress) onProgress('loadingModel');

  try {
    const { FilesetResolver, FaceDetector } = await import('../vendor/mediapipe/vision_bundle.mjs');
    const wasmResolver = await FilesetResolver.forVisionTasks('./vendor/mediapipe/wasm');

    try {
      faceDetectorInstance = await FaceDetector.createFromOptions(wasmResolver, {
        baseOptions: {
          modelAssetPath: './vendor/mediapipe/blaze_face_short_range.tflite',
          delegate: 'GPU'
        },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.55
      });
    } catch (gpuError) {
      console.warn('FaceDetector GPU delegate failed, falling back to CPU:', gpuError);
      faceDetectorInstance = await FaceDetector.createFromOptions(wasmResolver, {
        baseOptions: {
          modelAssetPath: './vendor/mediapipe/blaze_face_short_range.tflite',
          delegate: 'CPU'
        },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.55
      });
    }

    isModelLoading = false;
    return faceDetectorInstance;
  } catch (err) {
    console.error('Failed to load MediaPipe FaceDetector:', err);
    modelLoadFailed = true;
    isModelLoading = false;
    return null;
  }
}

/**
 * Rotate a canvas by angle degrees, returning new canvas and transform mapping
 */
export function rotateCanvas(canvas, deg) {
  const rad = (deg * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const w = canvas.width;
  const h = canvas.height;
  const newW = Math.round(w * cos + h * sin);
  const newH = Math.round(w * sin + h * cos);

  const rotCanvas = createCanvas(newW, newH);
  const ctx = rotCanvas.getContext('2d');
  ctx.translate(newW / 2, newH / 2);
  ctx.rotate(rad);
  ctx.drawImage(canvas, -w / 2, -h / 2);

  return { rotCanvas, newW, newH, deg };
}

/**
 * Create an edge-replicated padded canvas
 */
export function createPaddedCanvas(srcCanvas, padRatio = 0.25) {
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const padX = Math.round(w * padRatio);
  const padY = Math.round(h * padRatio);
  const padW = w + padX * 2;
  const padH = h + padY * 2;

  const padded = createCanvas(padW, padH);
  const ctx = padded.getContext('2d');

  // Fill edges with edge pixels
  ctx.drawImage(srcCanvas, padX, padY);

  // Top and bottom borders
  ctx.drawImage(srcCanvas, 0, 0, w, 1, padX, 0, w, padY);
  ctx.drawImage(srcCanvas, 0, h - 1, w, 1, padX, padY + h, w, padY);
  // Left and right borders
  ctx.drawImage(srcCanvas, 0, 0, 1, h, 0, padY, padX, h);
  ctx.drawImage(srcCanvas, w - 1, 0, 1, h, padX + w, padY, padX, h);

  return { padded, padX, padY };
}

/**
 * Validates a detected face candidate against facial anatomy, keypoint geometry,
 * skin-tone pigmentation, and paper-text rejection rules.
 */
export function validateFaceCandidate(face, canvas) {
  if (!face || !face.box || !canvas) return false;
  const { x, y, w, h } = face.box;

  // 1. Basic dimension and aspect ratio checks
  if (w < 20 || h < 20) return false;
  const aspect = w / h;
  if (aspect < 0.52 || aspect > 1.90) return false; // Faces are roughly upright ovals

  // 2. Anatomical Keypoints Geometry (if 6 BlazeFace keypoints exist)
  if (face.keypoints && face.keypoints.length >= 4) {
    const rightEye = face.keypoints[0];
    const leftEye = face.keypoints[1];
    const nose = face.keypoints[2];
    const mouth = face.keypoints[3];

    if (rightEye && leftEye) {
      const eyeDx = Math.abs(leftEye.x - rightEye.x);
      const eyeDy = Math.abs(leftEye.y - rightEye.y);
      // Eyes must have reasonable horizontal separation
      if (eyeDx < w * 0.12) return false;
      // Eyes shouldn't have extreme vertical tilt in an unrotated image
      if (eyeDy > eyeDx * 1.1) return false;
    }

    if (rightEye && leftEye && nose) {
      // Eyes should be vertically above or near nose level
      if (rightEye.y > nose.y + h * 0.22 || leftEye.y > nose.y + h * 0.22) return false;
    }

    if (nose && mouth) {
      // Nose should be above mouth
      if (nose.y > mouth.y + h * 0.22) return false;
    }
  }

  // 3. Pixel Texture & Skin-Tone / Paper Rejection Check
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const clampedX = Math.max(0, Math.min(canvas.width - 1, Math.floor(x)));
    const clampedY = Math.max(0, Math.min(canvas.height - 1, Math.floor(y)));
    const clampedW = Math.max(1, Math.min(canvas.width - clampedX, Math.floor(w)));
    const clampedH = Math.max(1, Math.min(canvas.height - clampedY, Math.floor(h)));

    if (clampedW < 10 || clampedH < 10) return false;

    const imgData = ctx.getImageData(clampedX, clampedY, clampedW, clampedH);
    const data = imgData.data;
    const totalPixels = clampedW * clampedH;

    let skinCount = 0;
    let brightPaperCount = 0;
    let darkInkCount = 0;
    let sumRg = 0, sumYb = 0, sumRgSq = 0, sumYbSq = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      if (luma > 170 && Math.abs(r - g) < 22 && Math.abs(g - b) < 22) {
        brightPaperCount++;
      } else if (luma < 100) {
        darkInkCount++;
      }

      // Skin tone detection
      if (r > g && g > b && (r - g) > 10 && (r - b) > 14 && r > 60 && b < 195) {
        skinCount++;
      }

      const rg = r - g;
      const yb = 0.5 * (r + g) - b;
      sumRg += rg;
      sumYb += yb;
      sumRgSq += rg * rg;
      sumYbSq += yb * yb;
    }

    const paperRatio = brightPaperCount / totalPixels;
    const skinRatio = skinCount / totalPixels;
    const inkRatio = darkInkCount / totalPixels;

    // Reject white paper documents with text/drawings:
    // If the detected box is > 55% plain paper with < 2.5% skin tones
    if (paperRatio > 0.55 && skinRatio < 0.025) {
      return false;
    }

    // Colorfulness calculation
    const meanRg = sumRg / totalPixels;
    const meanYb = sumYb / totalPixels;
    const stdRg = Math.sqrt(Math.max(0, sumRgSq / totalPixels - meanRg * meanRg));
    const stdYb = Math.sqrt(Math.max(0, sumYbSq / totalPixels - meanYb * meanYb));
    const colorfulness = Math.sqrt(stdRg * stdRg + stdYb * stdYb) + 0.3 * Math.sqrt(meanRg * meanRg + meanYb * meanYb);

    // If completely monochromatic with no skin and sparse strokes -> paper writing
    if (colorfulness < 12 && skinRatio < 0.02 && (paperRatio > 0.40 || inkRatio > 0.005)) {
      return false;
    }

    return true;
  } catch (err) {
    return true;
  }
}

/**
 * Single-pass detection on a given canvas with quality verification
 */
function runDetection(detector, canvas) {
  try {
    const res = detector.detect(canvas);
    if (!res || !res.detections || res.detections.length === 0) return [];

    const candidates = res.detections.map(d => {
      const bb = d.boundingBox;
      const score = (d.categories && d.categories[0]) ? d.categories[0].score : 0.5;
      const keypoints = (d.keypoints || []).map(kp => ({
        x: kp.x * (kp.x <= 1 ? canvas.width : 1),
        y: kp.y * (kp.y <= 1 ? canvas.height : 1)
      }));
      return {
        box: {
          x: bb.originX,
          y: bb.originY,
          w: bb.width,
          h: bb.height
        },
        score,
        keypoints
      };
    });

    return candidates.filter(f => f.score >= 0.55 && validateFaceCandidate(f, canvas));
  } catch (e) {
    console.warn('Detection call failed:', e);
    return [];
  }
}

/**
 * Full detection retry ladder as specified in §7
 * Ladder: (1) working copy, (2) 25% edge-replicated padding, (3) rotation ladder,
 * (4) scale ×1.5 / ×0.5.
 */
export async function detectFacesWithLadder(workingCanvas, fullCanvas, workingScale) {
  const detector = await getFaceDetector();
  if (!detector) {
    return { success: false, faces: [], method: 'no_detector' };
  }

  // If the image is already classified as a signature/paper document, don't waste time on face ladder
  const isDocument = classifyImageContent(workingCanvas) === 'signature';

  // Ladder Step 1: Standard working copy
  let rawFaces = runDetection(detector, workingCanvas);
  if (rawFaces.length > 0) {
    return {
      success: true,
      faces: mapFacesToFull(rawFaces, 1 / workingScale),
      detectedAngle: 0,
      method: 'direct'
    };
  }

  if (isDocument) {
    return { success: false, faces: [], detectedAngle: 0, method: 'document_skipped' };
  }

  // Ladder Step 2: 25% edge-replicated padding
  const { padded, padX, padY } = createPaddedCanvas(workingCanvas, 0.25);
  rawFaces = runDetection(detector, padded);
  if (rawFaces.length > 0) {
    const unpaddedFaces = rawFaces.map(f => ({
      ...f,
      box: {
        x: f.box.x - padX,
        y: f.box.y - padY,
        w: f.box.w,
        h: f.box.h
      },
      keypoints: f.keypoints.map(kp => ({ x: kp.x - padX, y: kp.y - padY }))
    }));
    return {
      success: true,
      faces: mapFacesToFull(unpaddedFaces, 1 / workingScale),
      detectedAngle: 0,
      method: 'padded'
    };
  }

  // Ladder Step 3: Rotation ladder (90°, 270°, 180°, ±15°, ±30°, ±45°, ±60°)
  const rotationAngles = [90, 270, 180, 15, -15, 30, -30, 45, -45, 60, -60];
  let bestRotResult = null;

  for (const deg of rotationAngles) {
    const { rotCanvas } = rotateCanvas(workingCanvas, deg);
    const rotFaces = runDetection(detector, rotCanvas);
    if (rotFaces.length > 0) {
      const topFace = rotFaces.reduce((prev, cur) => cur.score > prev.score ? cur : prev, rotFaces[0]);
      if (topFace.score >= 0.70 && (!bestRotResult || topFace.score > bestRotResult.score)) {
        bestRotResult = {
          deg,
          rotFaces,
          score: topFace.score,
          rotW: rotCanvas.width,
          rotH: rotCanvas.height
        };
      }
      // If score is strong at 90/180/270, we can break early
      if (topFace.score >= 0.80 && [90, 180, 270].includes(deg)) break;
    }
  }

  if (bestRotResult) {
    return {
      success: true,
      faces: [], // Calling code handles rotation of source canvas first
      detectedAngle: bestRotResult.deg,
      method: 'rotation'
    };
  }

  // Ladder Step 4: Scale adjustment (×1.5 if small, ×0.5 if very large)
  const isSmall = workingCanvas.width < 600 || workingCanvas.height < 600;
  const scaleFactor = isSmall ? 1.5 : 0.5;
  const scaledCanvas = createCanvas(
    Math.round(workingCanvas.width * scaleFactor),
    Math.round(workingCanvas.height * scaleFactor)
  );
  const sCtx = scaledCanvas.getContext('2d');
  sCtx.drawImage(workingCanvas, 0, 0, scaledCanvas.width, scaledCanvas.height);

  rawFaces = runDetection(detector, scaledCanvas);
  if (rawFaces.length > 0) {
    const rescale = (1 / scaleFactor) * (1 / workingScale);
    return {
      success: true,
      faces: mapFacesToFull(rawFaces, rescale),
      detectedAngle: 0,
      method: 'scaled'
    };
  }

  return { success: false, faces: [], detectedAngle: 0, method: 'failed' };
}

function mapFacesToFull(faces, scaleFactor) {
  return faces.map(f => ({
    box: {
      x: f.box.x * scaleFactor,
      y: f.box.y * scaleFactor,
      w: f.box.w * scaleFactor,
      h: f.box.h * scaleFactor
    },
    score: f.score,
    keypoints: f.keypoints.map(kp => ({
      x: kp.x * scaleFactor,
      y: kp.y * scaleFactor
    }))
  }));
}

/**
 * Select primary face from list (largest face, tie: closest to center)
 */
export function selectPrimaryFace(faces, imgW, imgH) {
  if (!faces || faces.length === 0) return null;
  if (faces.length === 1) return { primaryFace: faces[0], hasMultiple: false };

  const cx = imgW / 2;
  const cy = imgH / 2;

  let best = faces[0];
  let bestArea = best.box.w * best.box.h;
  let bestDist = Math.hypot((best.box.x + best.box.w / 2) - cx, (best.box.y + best.box.h / 2) - cy);

  for (let i = 1; i < faces.length; i++) {
    const f = faces[i];
    const area = f.box.w * f.box.h;
    const dist = Math.hypot((f.box.x + f.box.w / 2) - cx, (f.box.y + f.box.h / 2) - cy);

    // If area differs by more than 10%, pick larger; otherwise pick closer to center
    if (area > bestArea * 1.1) {
      best = f;
      bestArea = area;
      bestDist = dist;
    } else if (Math.abs(area - bestArea) / bestArea <= 0.1 && dist < bestDist) {
      best = f;
      bestDist = dist;
    }
  }

  return { primaryFace: best, hasMultiple: true };
}

/**
 * Calculate passport / photo crop box according to Section 7 spec
 * 
 * Formulas:
 * fh' = fh * 1.25, center shifted up 0.08 * fh
 * S = fh' * 1.9 (head ≈ 52% of frame height)
 * Crop center x = face center x; y = face center y + 0.12 * S
 * For target aspect ratio W/H: crop height = S, crop width = S * (targetW / targetH)
 */
export function computePassportCrop(faceBox, imgW, imgH, targetW, targetH) {
  const fw = faceBox.w;
  const fh = faceBox.h;
  const fcx = faceBox.x + fw / 2;
  const fcy = faceBox.y + fh / 2;

  // Expanded face height
  const fhPrime = fh * CONFIG.FACE.HEAD_RATIO;
  const shiftedCenterY = fcy - fh * CONFIG.FACE.SHIFT_UP_RATIO;

  // Base square side S
  let S = fhPrime * CONFIG.FACE.CROP_SIDE_RATIO;

  const targetAspect = targetW / targetH;
  let cropW, cropH;

  if (targetAspect >= 1) {
    cropH = S;
    cropW = S * targetAspect;
  } else {
    cropH = S;
    cropW = S * targetAspect;
  }

  let cropX = fcx - cropW / 2;
  let cropY = (shiftedCenterY + CONFIG.FACE.CENTER_Y_SHIFT_RATIO * cropH) - cropH / 2;

  // If crop exceeds image dimensions, adjust gracefully
  if (cropW > imgW || cropH > imgH) {
    const scaleFactor = Math.min(imgW / cropW, imgH / cropH);
    cropW *= scaleFactor;
    cropH *= scaleFactor;
    cropX = fcx - cropW / 2;
    cropY = (shiftedCenterY + CONFIG.FACE.CENTER_Y_SHIFT_RATIO * cropH) - cropH / 2;
  }

  // Shift inside bounds
  if (cropX < 0) cropX = 0;
  if (cropY < 0) cropY = 0;
  if (cropX + cropW > imgW) cropX = imgW - cropW;
  if (cropY + cropH > imgH) cropY = imgH - cropH;

  // Clamp within image bounds
  cropX = Math.max(0, cropX);
  cropY = Math.max(0, cropY);
  cropW = Math.min(imgW - cropX, cropW);
  cropH = Math.min(imgH - cropY, cropH);

  return {
    x: Math.round(cropX),
    y: Math.round(cropY),
    w: Math.round(cropW),
    h: Math.round(cropH)
  };
}

/**
 * Quality check analyses (small face, blur, lighting, pose)
 */
export function checkFaceQuality(face, imgW, imgH, canvas) {
  const warnings = [];

  // 1. Face too small (< 25% of source height)
  if (face.box.h < imgH * 0.25) {
    warnings.push('warnSmallFace');
  }

  // 2. Pose straightness check using eye keypoints if present
  if (face.keypoints && face.keypoints.length >= 2) {
    const rightEye = face.keypoints[0];
    const leftEye = face.keypoints[1];
    if (rightEye && leftEye) {
      const dX = leftEye.x - rightEye.x;
      const dY = leftEye.y - rightEye.y;
      const tiltDeg = Math.abs((Math.atan2(dY, dX) * 180) / Math.PI);
      if (tiltDeg > 20) {
        warnings.push('warnPose');
      }
    }
  }

  // 3. Blur detection via Laplacian variance on face patch
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const patchX = Math.max(0, Math.floor(face.box.x));
    const patchY = Math.max(0, Math.floor(face.box.y));
    const patchW = Math.min(canvas.width - patchX, Math.floor(face.box.w));
    const patchH = Math.min(canvas.height - patchY, Math.floor(face.box.h));

    if (patchW > 16 && patchH > 16) {
      const imgData = ctx.getImageData(patchX, patchY, patchW, patchH);
      const data = imgData.data;

      // Compute mean luma
      let sumLuma = 0;
      const count = patchW * patchH;
      const gray = new Float32Array(count);

      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        gray[j] = luma;
        sumLuma += luma;
      }

      const meanLuma = sumLuma / count;
      if (meanLuma < 55) {
        warnings.push('warnDark');
      } else if (meanLuma > 215) {
        warnings.push('warnBright');
      }

      // Laplacian variance
      let lapSum = 0;
      let lapSqSum = 0;
      let lapCount = 0;

      for (let y = 1; y < patchH - 1; y += 2) {
        for (let x = 1; x < patchW - 1; x += 2) {
          const idx = y * patchW + x;
          const lap = -4 * gray[idx] +
            gray[idx - 1] + gray[idx + 1] +
            gray[idx - patchW] + gray[idx + patchW];
          lapSum += lap;
          lapSqSum += lap * lap;
          lapCount++;
        }
      }

      const lapMean = lapSum / (lapCount || 1);
      const lapVar = (lapSqSum / (lapCount || 1)) - (lapMean * lapMean);

      // Low variance implies blur
      if (lapVar < 45) {
        warnings.push('warnBlur');
      }
    }
  } catch (e) {
    // Canvas read security or dimension issue
  }

  return warnings;
}
