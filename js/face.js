// js/face.js - MediaPipe Face Detection, Orientation/Tilt, Auto-Enhance, and Smart/Passport Crop Math
import { CONFIG } from './i18n.js';
import { createCanvas, stepDownDownscale } from './loader.js';
import { classifyImageContent } from './signature.js';

let faceDetectorInstance = null;
let isModelLoading = false;
let modelLoadingPromise = null;
let modelLoadFailed = false;

/**
 * Initialize MediaPipe FaceDetector with GPU delegate and CPU fallback
 */
export async function getFaceDetector(onProgress) {
  if (faceDetectorInstance) return faceDetectorInstance;
  if (modelLoadFailed) return null;
  if (modelLoadingPromise) return modelLoadingPromise;

  isModelLoading = true;
  if (onProgress) onProgress('loadingModel');

  modelLoadingPromise = (async () => {
    try {
      const { FilesetResolver, FaceDetector } = await import('../vendor/mediapipe/vision_bundle.mjs');
      const wasmUrl = new URL('../vendor/mediapipe/wasm', import.meta.url).href;
      const modelUrl = new URL('../vendor/mediapipe/blaze_face_short_range.tflite', import.meta.url).href;
      const wasmResolver = await FilesetResolver.forVisionTasks(wasmUrl);

      try {
        faceDetectorInstance = await FaceDetector.createFromOptions(wasmResolver, {
          baseOptions: {
            modelAssetPath: modelUrl,
            delegate: 'GPU'
          },
          runningMode: 'IMAGE',
          minDetectionConfidence: 0.35
        });
      } catch (gpuError) {
        console.warn('FaceDetector GPU delegate failed, falling back to CPU:', gpuError);
        faceDetectorInstance = await FaceDetector.createFromOptions(wasmResolver, {
          baseOptions: {
            modelAssetPath: modelUrl,
            delegate: 'CPU'
          },
          runningMode: 'IMAGE',
          minDetectionConfidence: 0.35
        });
      }

      isModelLoading = false;
      return faceDetectorInstance;
    } catch (err) {
      console.error('Failed to load MediaPipe FaceDetector:', err);
      modelLoadFailed = true;
      isModelLoading = false;
      modelLoadingPromise = null;
      return null;
    }
  })();

  return modelLoadingPromise;
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
 * Fast luma contrast stretch helper for detecting faces in low-contrast, dark, or backlit photos
 */
function boostLumaContrast(canvas) {
  try {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    let minLuma = 255;
    let maxLuma = 0;
    const step = Math.max(1, Math.floor(data.length / (4 * 2048)));
    for (let i = 0; i < data.length; i += step * 4) {
      const l = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      if (l < minLuma) minLuma = l;
      if (l > maxLuma) maxLuma = l;
    }

    if (maxLuma - minLuma < 120 || (minLuma > 35 && maxLuma < 225)) {
      const range = Math.max(1, maxLuma - minLuma);
      const boosted = createCanvas(w, h);
      const bCtx = boosted.getContext('2d');
      const bImg = bCtx.createImageData(w, h);
      const bd = bImg.data;
      for (let i = 0; i < data.length; i += 4) {
        bd[i] = Math.max(0, Math.min(255, Math.round(((data[i] - minLuma) / range) * 255)));
        bd[i + 1] = Math.max(0, Math.min(255, Math.round(((data[i + 1] - minLuma) / range) * 255)));
        bd[i + 2] = Math.max(0, Math.min(255, Math.round(((data[i + 2] - minLuma) / range) * 255)));
        bd[i + 3] = data[i + 3];
      }
      bCtx.putImageData(bImg, 0, 0);
      return boosted;
    }
  } catch (e) {}
  return null;
}

/**
 * Validates a detected face candidate against facial anatomy, keypoint geometry,
 * and rejects pure paper documents with isolated strokes. Supports both color & black-and-white photos.
 */
export function validateFaceCandidate(face, canvas) {
  if (!face || !face.box || !canvas) return false;
  const { x, y, w, h } = face.box;

  // 1. Basic dimension and aspect ratio checks (human faces are upright ovals)
  if (w < 20 || h < 20) return false;
  const aspect = w / h;
  if (aspect < 0.55 || aspect > 1.65) return false;

  // 2. Anatomical Keypoints Geometry (if BlazeFace landmarks exist)
  if (face.keypoints && face.keypoints.length >= 4) {
    const rightEye = face.keypoints[0];
    const leftEye = face.keypoints[1];
    const nose = face.keypoints[2];
    const mouth = face.keypoints[3];

    if (rightEye && leftEye) {
      const eyeDist = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y);
      // Eyes must have realistic facial spacing (18% to 75% of face width)
      if (eyeDist < w * 0.18 || eyeDist > w * 0.75) return false;

      const eyeDx = Math.abs(leftEye.x - rightEye.x);
      const eyeDy = Math.abs(leftEye.y - rightEye.y);
      // Eyes must have reasonable horizontal separation
      if (eyeDx < w * 0.12) return false;
      // Eyes shouldn't have extreme vertical tilt in an upright image
      if (eyeDy > eyeDx * 1.0) return false;
    }

    if (rightEye && leftEye && nose) {
      const minEyeX = Math.min(leftEye.x, rightEye.x);
      const maxEyeX = Math.max(leftEye.x, rightEye.x);
      // Nose must be horizontally centered between the eyes
      if (nose.x < minEyeX - w * 0.15 || nose.x > maxEyeX + w * 0.15) return false;

      // Eyes should be vertically above or near nose level
      const eyeMidY = (leftEye.y + rightEye.y) / 2;
      if (nose.y < eyeMidY - h * 0.05) return false;
    }

    if (nose && mouth) {
      // Nose should be above mouth
      if (mouth.y < nose.y - h * 0.05) return false;
    }
  } else if (face.score < 0.60) {
    // Low-confidence candidates without full facial keypoints are false artifacts
    return false;
  }

  // 3. Pixel Texture & Document/Signature/Text Rejection Check
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

    const lumaArr = new Float32Array(totalPixels);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      lumaArr[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    const cx0 = Math.floor(clampedW * 0.20);
    const cx1 = Math.max(cx0 + 1, Math.ceil(clampedW * 0.80));
    const cy0 = Math.floor(clampedH * 0.20);
    const cy1 = Math.max(cy0 + 1, Math.ceil(clampedH * 0.80));

    let skinCount = 0;
    let brightPaperCount = 0;
    let smoothPaperCount = 0;
    let darkInkCount = 0;
    let midToneOrganicCount = 0;

    let coreTotal = 0;
    let coreSkinCount = 0;
    let coreSmoothPaperCount = 0;

    for (let py = 0; py < clampedH; py++) {
      const rowOffset = py * clampedW;
      const inCoreY = py >= cy0 && py < cy1;
      for (let px = 0; px < clampedW; px++) {
        const p = rowOffset + px;
        const i = p * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const luma = lumaArr[p];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;

        const gx = px > 0 ? Math.abs(luma - lumaArr[p - 1]) : 0;
        const gy = py > 0 ? Math.abs(luma - lumaArr[p - clampedW]) : 0;
        const grad = gx + gy;

        // Detect white, off-white, or shadowed warm indoor paper background (down to luma 84)
        const isPaper = (luma > 155 && Math.abs(r - g) < 28 && Math.abs(g - b) < 32 && (r - b) < 48) ||
                        (luma >= 84 && sat < 0.25 && Math.abs(r - g) < 26 && (r - b) < 46 && grad < 16);
        const isSmoothPaper = isPaper && grad < 13;

        const isInk = (luma < 84) ||
                      (grad >= 16 && luma < 145) ||
                      (b > r + 15 && b > g + 10 && luma < 175) ||
                      (r > g + 35 && r > b + 35 && luma < 165);

        if (isPaper) {
          brightPaperCount++;
          if (isSmoothPaper) smoothPaperCount++;
        } else if (isInk) {
          darkInkCount++;
        } else if (luma >= 85 && luma <= 195) {
          midToneOrganicCount++;
        }

        // True chromatic human skin tone detection (strictly rejects warm indoor gray/beige paper)
        const isSkin = !isPaper && sat >= 0.20 && sat <= 0.68 && luma >= 48 && luma <= 225 &&
                       r > g && g >= b && (r - g) >= 18 && (r - b) >= 28;
        if (isSkin) {
          skinCount++;
        }

        if (inCoreY && px >= cx0 && px < cx1) {
          coreTotal++;
          if (isSkin) coreSkinCount++;
          if (isSmoothPaper) coreSmoothPaperCount++;
        }
      }
    }

    const paperRatio = brightPaperCount / totalPixels;
    const smoothPaperRatio = smoothPaperCount / totalPixels;
    const skinRatio = skinCount / totalPixels;
    const inkRatio = darkInkCount / totalPixels;
    const midToneRatio = midToneOrganicCount / totalPixels;
    const bimodalPaperInk = paperRatio + inkRatio;

    const coreSkinRatio = coreTotal > 0 ? coreSkinCount / coreTotal : 0;
    const coreSmoothPaperRatio = coreTotal > 0 ? coreSmoothPaperCount / coreTotal : 0;

    // A: Reject empty or near-empty paper, or boxes whose central facial core is flat smooth paper
    if ((paperRatio > 0.62 && skinRatio < 0.03) || (coreSmoothPaperRatio > 0.45 && coreSkinRatio < 0.04)) {
      return false;
    }

    // B: Reject bimodal ink-on-paper (signatures, notebook binding holes, cursive loops, text blocks, stamps)
    // Real faces (even B&W) have continuous 3D mid-tone shading across cheeks/forehead/eyes, not flat paper + ink strokes
    if (bimodalPaperInk > 0.72 && skinRatio < 0.04 && midToneRatio < 0.24) {
      return false;
    }

    // C: If the candidate box has significant paper (> 38%) and virtually no skin (< 3%),
    // require high BlazeFace confidence + organic midtones (prevents false face boxes on handwriting/notebooks)
    if ((paperRatio > 0.38 || smoothPaperRatio > 0.32) && skinRatio < 0.03 && (face.score < 0.82 || midToneRatio < 0.25)) {
      return false;
    }

    // D: Whole-canvas document/signature check — if the overall image is a signature/text document,
    // reject any face candidate that lacks unmistakable human skin or extreme confidence
    if (skinRatio < 0.10 || coreSkinRatio < 0.10 || face.score < 0.88) {
      const wholeKind = classifyImageContent(canvas);
      if (wholeKind === 'signature' && (face.score < 0.88 || coreSkinRatio < 0.14 || coreSmoothPaperRatio > 0.32)) {
        return false;
      }
    }

    return true;
  } catch (err) {
    return true;
  }
}

/**
 * Single-pass detection on a given canvas with quality verification
 */
function runDetection(detector, canvas, minScore = 0.45) {
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

    return candidates.filter(f => f.score >= minScore && validateFaceCandidate(f, canvas));
  } catch (e) {
    console.warn('Detection call failed:', e);
    return [];
  }
}

/**
 * Full detection retry ladder:
 * (1) direct working copy (0.45),
 * (2) 20% edge-replicated padding (fixes edge-touching selfies),
 * (3) contrast/luma boosted copy (fixes dark/backlit photos),
 * (4) multi-scale pass (1.4x / 0.7x),
 * (5) sensitive upright pass (0.38) on base and boosted images,
 * (6) strictly 90° incremental rotations only if image is landscape.
 */
export async function detectFacesWithLadder(workingCanvas, fullCanvas, workingScale) {
  const detector = await getFaceDetector();
  if (!detector) {
    return { success: false, faces: [], method: 'no_detector' };
  }

  // Ladder Step 1: Standard working copy
  let rawFaces = runDetection(detector, workingCanvas, 0.45);
  if (rawFaces.length > 0) {
    return {
      success: true,
      faces: mapFacesToFull(rawFaces, 1 / workingScale),
      detectedAngle: 0,
      method: 'direct'
    };
  }

  // Ladder Step 2: 20% edge-replicated padding (fixes faces touching image edges)
  const { padded, padX, padY } = createPaddedCanvas(workingCanvas, 0.20);
  rawFaces = runDetection(detector, padded, 0.42);
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

  // Ladder Step 3: Contrast/Levels boost (fixes underexposed, dark, or backlit portrait photos)
  const boosted = boostLumaContrast(workingCanvas);
  if (boosted) {
    rawFaces = runDetection(detector, boosted, 0.42);
    if (rawFaces.length > 0) {
      return {
        success: true,
        faces: mapFacesToFull(rawFaces, 1 / workingScale),
        detectedAngle: 0,
        method: 'contrast_boost'
      };
    }
  }

  // Ladder Step 4: Scale adjustment (1.4x scale up for small faces, 0.7x for high-res)
  const isSmall = workingCanvas.width < 600 || workingCanvas.height < 600;
  const scaleFactor = isSmall ? 1.4 : 0.7;
  const scaledCanvas = createCanvas(
    Math.round(workingCanvas.width * scaleFactor),
    Math.round(workingCanvas.height * scaleFactor)
  );
  const sCtx = scaledCanvas.getContext('2d');
  sCtx.drawImage(workingCanvas, 0, 0, scaledCanvas.width, scaledCanvas.height);

  rawFaces = runDetection(detector, scaledCanvas, 0.42);
  if (rawFaces.length > 0) {
    const rescale = (1 / scaleFactor) * (1 / workingScale);
    return {
      success: true,
      faces: mapFacesToFull(rawFaces, rescale),
      detectedAngle: 0,
      method: 'scaled'
    };
  }

  // Ladder Step 5: Sensitive upright pass (0.38) with strict anatomical validation
  rawFaces = runDetection(detector, workingCanvas, 0.38);
  if (rawFaces.length > 0) {
    return {
      success: true,
      faces: mapFacesToFull(rawFaces, 1 / workingScale),
      detectedAngle: 0,
      method: 'sensitive_upright'
    };
  }

  if (boosted) {
    rawFaces = runDetection(detector, boosted, 0.38);
    if (rawFaces.length > 0) {
      return {
        success: true,
        faces: mapFacesToFull(rawFaces, 1 / workingScale),
        detectedAngle: 0,
        method: 'boosted_sensitive'
      };
    }
  }

  // Ladder Step 6: 90-degree rotations ONLY when image orientation indicates need
  // If the image is already portrait/tall (width <= height * 1.05), NEVER test 90° or 270°!
  // Also, if pixel/spatial classifier says this is a signature/text document on paper, NEVER rotate looking for faces!
  if (classifyImageContent(workingCanvas) === 'signature') {
    return { success: false, faces: [], detectedAngle: 0, method: 'failed' };
  }

  const isLandscape = workingCanvas.width > workingCanvas.height * 1.05;
  const rotationAngles = isLandscape ? [90, 270, 180] : [180];
  let bestRotResult = null;

  for (const deg of rotationAngles) {
    const { rotCanvas } = rotateCanvas(workingCanvas, deg);
    const minConf = deg === 180 ? 0.85 : 0.80;
    const rotFaces = runDetection(detector, rotCanvas, minConf);
    if (rotFaces.length > 0) {
      const topFace = rotFaces.reduce((prev, cur) => cur.score > prev.score ? cur : prev, rotFaces[0]);
      if (topFace.score >= minConf && (!bestRotResult || topFace.score > bestRotResult.score)) {
        bestRotResult = {
          deg,
          rotFaces,
          score: topFace.score,
          rotW: rotCanvas.width,
          rotH: rotCanvas.height
        };
      }
      if (topFace.score >= 0.88) break;
    }
  }

  if (bestRotResult) {
    return {
      success: true,
      faces: mapFacesToFull(bestRotResult.rotFaces, 1 / workingScale),
      detectedAngle: bestRotResult.deg,
      method: 'rotation'
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

  // Base square side S (head ≈ 52% of frame height)
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

  // Constrain crop box to fit completely within image while strictly preserving targetAspect
  if (cropW > imgW || cropH > imgH) {
    const scaleFactor = Math.min(imgW / cropW, imgH / cropH);
    cropW = Math.max(20, Math.floor(cropW * scaleFactor));
    cropH = Math.max(20, Math.round(cropW / targetAspect));
  } else {
    cropW = Math.round(cropW);
    cropH = Math.round(cropH);
  }

  // Center horizontally on face, and position face with golden headroom
  let cropX = Math.round(fcx - cropW / 2);
  let cropY = Math.round(shiftedCenterY + CONFIG.FACE.CENTER_Y_SHIFT_RATIO * cropH - cropH / 2);

  // Shift inside bounds strictly without altering cropW or cropH (maintaining exact target aspect ratio)
  cropX = Math.max(0, Math.min(imgW - cropW, cropX));
  cropY = Math.max(0, Math.min(imgH - cropH, cropY));

  return {
    x: cropX,
    y: cropY,
    w: cropW,
    h: cropH
  };
}

/**
 * Intelligent portrait composition fallback when no face is recognized by neural detector:
 * Accurately frames upper-body and head centered with exact target aspect ratio.
 */
export function computePortraitFallbackCrop(imgW, imgH, targetW, targetH) {
  const targetAspect = targetW / targetH;
  let cropW, cropH;

  if (imgW / imgH > targetAspect) {
    cropH = Math.round(imgH * 0.90);
    cropW = Math.round(cropH * targetAspect);
  } else {
    cropW = Math.round(imgW * 0.90);
    cropH = Math.round(cropW / targetAspect);
  }

  if (cropW > imgW) {
    cropW = imgW;
    cropH = Math.round(cropW / targetAspect);
  }
  if (cropH > imgH) {
    cropH = imgH;
    cropW = Math.round(cropH * targetAspect);
  }

  const cropX = Math.max(0, Math.min(imgW - cropW, Math.round((imgW - cropW) / 2)));
  const cropY = Math.max(0, Math.min(imgH - cropH, Math.round((imgH - cropH) * 0.15)));

  return {
    x: cropX,
    y: cropY,
    w: cropW,
    h: cropH
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


/**
 * Calculate eye tilt angle in degrees from keypoints
 * @param {Array<{x: number, y: number}>} keypoints 
 * @returns {number} Angle in degrees (-45..+45)
 */
export function calculateEyeTilt(keypoints) {
  // Never automatically tilt upright photos based on head pose / eye keypoints,
  // as rotating the canvas introduces white corner wedges and tilts the background/shoulders.
  return 0;
}

/**
 * Rotate canvas with edge-replicated background to avoid black corners
 */
export function rotateWithEdgeReplication(canvas, deg) {
  if (Math.abs(deg) < 0.05) return canvas;

  const rad = (deg * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const w = canvas.width;
  const h = canvas.height;
  const newW = Math.round(w * cos + h * sin);
  const newH = Math.round(w * sin + h * cos);

  const out = createCanvas(newW, newH);
  const ctx = out.getContext('2d');

  // Fill base with clean neutral color - never draw unrotated image underneath (fixes B2 ghosting)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, newW, newH);

  // Draw rotated source
  ctx.save();
  ctx.translate(newW / 2, newH / 2);
  ctx.rotate(rad);
  ctx.drawImage(canvas, -w / 2, -h / 2);
  ctx.restore();

  return out;
}

/**
 * Auto-enhance contrast and brightness
 */
export function autoEnhanceCanvas(canvas, faceBox = null) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  const hist = new Uint32Array(256);
  const totalPixels = w * h;

  for (let i = 0; i < data.length; i += 4) {
    const luma = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[luma]++;
  }

  const lowThresh = Math.floor(totalPixels * 0.005);
  const highThresh = Math.floor(totalPixels * 0.995);

  let lowVal = 0;
  let highVal = 255;
  let acc = 0;

  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= lowThresh && lowVal === 0) {
      lowVal = i;
    }
    if (acc >= highThresh) {
      highVal = i;
      break;
    }
  }

  let meanLuma = 0;
  if (faceBox) {
    const fx = Math.max(0, Math.floor(faceBox.x));
    const fy = Math.max(0, Math.floor(faceBox.y));
    const fw = Math.min(w - fx, Math.floor(faceBox.w));
    const fh = Math.min(h - fy, Math.floor(faceBox.h));
    let faceSum = 0;
    let faceCount = 0;

    for (let y = fy; y < fy + fh; y += 2) {
      for (let x = fx; x < fx + fw; x += 2) {
        const idx = (y * w + x) * 4;
        faceSum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        faceCount++;
      }
    }
    meanLuma = faceSum / (faceCount || 1);
  } else {
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    meanLuma = sum / totalPixels;
  }

  const isNarrow = (highVal - lowVal) < 180;
  const isOffLuma = meanLuma < 65 || meanLuma > 190;

  if (!isNarrow && !isOffLuma) {
    return { canvas, applied: false };
  }

  let gamma = 1.0;
  if (meanLuma > 10 && meanLuma < 240) {
    gamma = Math.log(120 / 255) / Math.log(meanLuma / 255);
    gamma = Math.max(0.65, Math.min(1.45, gamma));
  }

  const lut = new Uint8Array(256);
  const range = Math.max(1, highVal - lowVal);

  for (let i = 0; i < 256; i++) {
    let stretched = ((i - lowVal) / range) * 255;
    stretched = Math.max(0, Math.min(255, stretched));
    const normalized = Math.pow(stretched / 255, 1 / gamma) * 255;
    lut[i] = Math.max(0, Math.min(255, Math.round(normalized)));
  }

  const enhancedCanvas = createCanvas(w, h);
  const enhCtx = enhancedCanvas.getContext('2d');
  const outData = enhCtx.createImageData(w, h);
  const dst = outData.data;

  for (let i = 0; i < data.length; i += 4) {
    dst[i] = lut[data[i]];
    dst[i + 1] = lut[data[i + 1]];
    dst[i + 2] = lut[data[i + 2]];
    dst[i + 3] = data[i + 3];
  }

  enhCtx.putImageData(outData, 0, 0);
  return { canvas: enhancedCanvas, applied: true };
}

/**
 * Detect paper tilt from lines / scan edges for signatures (§6)
 */
export function detectSignaturePaperTilt(canvas, components) {
  if (!components || components.length === 0) return 0;

  const w = canvas.width;
  let candidateLine = null;
  let maxLineWidth = 0;

  for (const comp of components) {
    const aspect = comp.w / Math.max(1, comp.h);
    if ((comp.w > w * 0.55 || aspect > 12.0) && comp.points && comp.points.length > 100) {
      if (comp.w > maxLineWidth) {
        maxLineWidth = comp.w;
        candidateLine = comp;
      }
    }
  }

  if (!candidateLine) return 0;

  const pts = candidateLine.points;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  const n = pts.length;

  for (let i = 0; i < n; i++) {
    const x = pts[i].x;
    const y = pts[i].y;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const denom = (n * sumXX - sumX * sumX);
  if (denom === 0) return 0;

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  let residualSq = 0;
  for (let i = 0; i < n; i++) {
    const expectedY = slope * pts[i].x + intercept;
    const diff = pts[i].y - expectedY;
    residualSq += diff * diff;
  }
  const meanResidual = Math.sqrt(residualSq / n);
  if (meanResidual > 3.0) {
    return 0;
  }

  const angleDeg = (Math.atan(slope) * 180) / Math.PI;
  if (Math.abs(angleDeg) >= 2.5 && Math.abs(angleDeg) <= 10) {
    return Math.round(angleDeg * 10) / 10;
  }

  return 0;
}

/**
 * Sobel gradient energy + local color contrast on downscaled thumbnail (<= 256px)
 */
function computeSaliencyMap(canvas) {
  const maxDim = 256;
  const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
  const sw = Math.max(16, Math.round(canvas.width * scale));
  const sh = Math.max(16, Math.round(canvas.height * scale));

  const thumb = createCanvas(sw, sh);
  const tCtx = thumb.getContext('2d', { willReadFrequently: true });
  tCtx.drawImage(canvas, 0, 0, sw, sh);
  const data = tCtx.getImageData(0, 0, sw, sh).data;

  const luma = new Float32Array(sw * sh);
  const sat = new Float32Array(sw * sh);

  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    luma[j] = 0.299 * r + 0.587 * g + 0.114 * b;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    sat[j] = max === 0 ? 0 : (max - min) / 255;
  }

  const energy = new Float32Array(sw * sh);
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const idx = y * sw + x;

      const gx =
        -1 * luma[(y - 1) * sw + (x - 1)] + 1 * luma[(y - 1) * sw + (x + 1)] +
        -2 * luma[y * sw + (x - 1)]       + 2 * luma[y * sw + (x + 1)] +
        -1 * luma[(y + 1) * sw + (x - 1)] + 1 * luma[(y + 1) * sw + (x + 1)];

      const gy =
        -1 * luma[(y - 1) * sw + (x - 1)] - 2 * luma[(y - 1) * sw + x] - 1 * luma[(y - 1) * sw + (x + 1)] +
         1 * luma[(y + 1) * sw + (x - 1)] + 2 * luma[(y + 1) * sw + x] + 1 * luma[(y + 1) * sw + (x + 1)];

      const grad = Math.hypot(gx, gy);
      energy[idx] = grad * (1 + sat[idx] * 0.5);
    }
  }

  return { energy, sw, sh, scale };
}

/**
 * Slide target aspect window across multi-scales (100% down to 70%)
 * to find the crop rectangle that maximizes saliency with center bias
 */
export function computeSaliencyCrop(canvas, targetW, targetH) {
  const { energy, sw, sh, scale } = computeSaliencyMap(canvas);
  const targetAspect = targetW / targetH;

  const integral = new Float64Array((sw + 1) * (sh + 1));
  const intW = sw + 1;

  for (let y = 0; y < sh; y++) {
    let rowSum = 0;
    for (let x = 0; x < sw; x++) {
      rowSum += energy[y * sw + x];
      integral[(y + 1) * intW + (x + 1)] = integral[y * intW + (x + 1)] + rowSum;
    }
  }

  function getRectSum(x1, y1, x2, y2) {
    const rx1 = Math.max(0, Math.min(sw, Math.round(x1)));
    const ry1 = Math.max(0, Math.min(sh, Math.round(y1)));
    const rx2 = Math.max(0, Math.min(sw, Math.round(x2)));
    const ry2 = Math.max(0, Math.min(sh, Math.round(y2)));
    return (
      integral[ry2 * intW + rx2] -
      integral[ry1 * intW + rx2] -
      integral[ry2 * intW + rx1] +
      integral[ry1 * intW + rx1]
    );
  }

  let bestScore = -1;
  let bestRect = null;
  const scales = [1.0, 0.9, 0.8, 0.7];

  for (const s of scales) {
    let winW, winH;
    if (sw / sh > targetAspect) {
      winH = Math.round(sh * s);
      winW = Math.round(winH * targetAspect);
    } else {
      winW = Math.round(sw * s);
      winH = Math.round(winW / targetAspect);
    }

    if (winW > sw || winH > sh || winW < 8 || winH < 8) continue;

    const stepX = Math.max(1, Math.floor((sw - winW) / 12));
    const stepY = Math.max(1, Math.floor((sh - winH) / 12));

    for (let y = 0; y <= sh - winH; y += stepY) {
      for (let x = 0; x <= sw - winW; x += stepX) {
        const sum = getRectSum(x, y, x + winW, y + winH);
        const winArea = winW * winH;
        const avgEnergy = sum / winArea;

        const cx = x + winW / 2;
        const cy = y + winH / 2;
        const distFromCenter = Math.hypot((cx - sw / 2) / sw, (cy - sh / 2) / sh);
        const centerBias = 1.0 - distFromCenter * 0.15;

        const score = avgEnergy * centerBias;

        if (score > bestScore) {
          bestScore = score;
          bestRect = { x, y, w: winW, h: winH };
        }
      }
    }
  }

  if (!bestRect) {
    if (canvas.width / canvas.height > targetAspect) {
      const h = canvas.height;
      const w = Math.round(h * targetAspect);
      return { x: Math.round((canvas.width - w) / 2), y: 0, w, h };
    } else {
      const w = canvas.width;
      const h = Math.round(w / targetAspect);
      return { x: 0, y: Math.round((canvas.height - h) / 2), w, h };
    }
  }

  return {
    x: Math.round(bestRect.x / scale),
    y: Math.round(bestRect.y / scale),
    w: Math.round(bestRect.w / scale),
    h: Math.round(bestRect.h / scale)
  };
}

/**
 * Compute face-aware crop for general images & avatars (§9)
 */
export function computeFaceAwareCrop(faces, imgW, imgH, targetW, targetH, kind = 'image') {
  const targetAspect = targetW / targetH;

  if (kind === 'avatar' && faces.length > 0) {
    const f = faces[0];
    const cropH = f.box.h / 0.5;
    const cropW = cropH * targetAspect;
    const cx = f.box.x + f.box.w / 2;
    const cy = f.box.y + f.box.h / 2;

    let x = cx - cropW / 2;
    let y = cy - cropH / 2;

    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + cropW > imgW) x = imgW - cropW;
    if (y + cropH > imgH) y = imgH - cropH;

    return {
      x: Math.round(Math.max(0, x)),
      y: Math.round(Math.max(0, y)),
      w: Math.round(Math.min(imgW, cropW)),
      h: Math.round(Math.min(imgH, cropH))
    };
  }

  let minX = faces[0].box.x;
  let maxX = faces[0].box.x + faces[0].box.w;
  let minY = faces[0].box.y;
  let maxY = faces[0].box.y + faces[0].box.h;

  for (let i = 1; i < faces.length; i++) {
    const b = faces[i].box;
    if (b.x < minX) minX = b.x;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y < minY) minY = b.y;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }

  const unionW = maxX - minX;
  const unionH = maxY - minY;
  const cx = minX + unionW / 2;
  const cy = minY + unionH / 2;

  let cropH = unionH * 2.0;
  let cropW = cropH * targetAspect;

  if (cropW < unionW * 1.4) {
    cropW = unionW * 1.4;
    cropH = cropW / targetAspect;
  }

  if (cropW > imgW || cropH > imgH) {
    const scale = Math.min(imgW / cropW, imgH / cropH);
    cropW *= scale;
    cropH *= scale;
  }

  let x = cx - cropW / 2;
  let y = cy - cropH * 0.40;

  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + cropW > imgW) x = imgW - cropW;
  if (y + cropH > imgH) y = imgH - cropH;

  return {
    x: Math.round(Math.max(0, x)),
    y: Math.round(Math.max(0, y)),
    w: Math.round(Math.min(imgW, cropW)),
    h: Math.round(Math.min(imgH, cropH))
  };
}

/**
 * Render image with chosen fit mode: 'cover' | 'contain' | 'stretch'
 */
export function renderFitMode(sourceCanvas, targetW, targetH, options = {}) {
  const {
    fit = 'cover',
    cropRect = null,
    bgColor = '#ffffff',
    blurredBg = false,
    transparent = false
  } = options;

  const out = createCanvas(targetW, targetH);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (!transparent) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, targetW, targetH);
  }

  if (fit === 'stretch') {
    ctx.drawImage(sourceCanvas, 0, 0, targetW, targetH);
    return out;
  }

  if (fit === 'contain') {
    if (blurredBg) {
      ctx.save();
      ctx.filter = 'blur(16px)';
      ctx.drawImage(sourceCanvas, -10, -10, targetW + 20, targetH + 20);
      ctx.restore();
    }

    const scale = Math.min(targetW / sourceCanvas.width, targetH / sourceCanvas.height);
    const dw = Math.round(sourceCanvas.width * scale);
    const dh = Math.round(sourceCanvas.height * scale);
    const dx = Math.round((targetW - dw) / 2);
    const dy = Math.round((targetH - dh) / 2);

    ctx.drawImage(sourceCanvas, dx, dy, dw, dh);
    return out;
  }

  const rect = {
    x: Math.round(cropRect?.x || 0),
    y: Math.round(cropRect?.y || 0),
    w: Math.max(1, Math.round(cropRect?.w || sourceCanvas.width)),
    h: Math.max(1, Math.round(cropRect?.h || sourceCanvas.height))
  };

  const cropCanvas = createCanvas(rect.w, rect.h);
  const cCtx = cropCanvas.getContext('2d');
  if (sourceCanvas.width > 0 && sourceCanvas.height > 0 && rect.w > 0 && rect.h > 0) {
    cCtx.drawImage(
      sourceCanvas,
      rect.x, rect.y, rect.w, rect.h,
      0, 0, rect.w, rect.h
    );
  }

  const downscaled = (rect.w > targetW * 1.5 || rect.h > targetH * 1.5)
    ? stepDownDownscale(cropCanvas, targetW, targetH)
    : cropCanvas;

  if (downscaled && downscaled.width > 0 && downscaled.height > 0) {
    ctx.drawImage(downscaled, 0, 0, targetW, targetH);
  }
  return out;
}
