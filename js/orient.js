// js/orient.js - Auto-orientation, tilt detection, paper straightener, and auto-enhancement
import { createCanvas } from './loader.js';
import { rotateCanvas } from './face.js';

/**
 * Calculate eye tilt angle in degrees from keypoints
 * @param {Array<{x: number, y: number}>} keypoints 
 * @returns {number} Angle in degrees (-45..+45)
 */
export function calculateEyeTilt(keypoints) {
  if (!keypoints || keypoints.length < 2) return 0;
  const rightEye = keypoints[0];
  const leftEye = keypoints[1];
  if (!rightEye || !leftEye) return 0;

  const dx = leftEye.x - rightEye.x;
  const dy = leftEye.y - rightEye.y;
  const angleRad = Math.atan2(dy, dx);
  const angleDeg = (angleRad * 180) / Math.PI;

  // Normal human head tilt is within -45..+45
  if (Math.abs(angleDeg) >= 2 && Math.abs(angleDeg) <= 45) {
    return angleDeg;
  }
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
 * Auto-enhance contrast and brightness:
 * If luma histogram range is narrow or face mean luma < 60 or > 200,
 * apply levels stretch (clip 0.5% each end) and gamma to bring face mean luma toward ~120.
 * Never blow out highlights. Only for photo/avatar/image.
 */
export function autoEnhanceCanvas(canvas, faceBox = null) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Compute overall histogram
  const hist = new Uint32Array(256);
  const totalPixels = w * h;

  for (let i = 0; i < data.length; i += 4) {
    const luma = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[luma]++;
  }

  // Find 0.5% and 99.5% percentiles
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

  // Calculate face mean luma if face provided, else whole image
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

  // Check if enhancement is warranted:
  // Narrow range: (highVal - lowVal) < 180, or mean luma < 65 or > 190
  const isNarrow = (highVal - lowVal) < 180;
  const isOffLuma = meanLuma < 65 || meanLuma > 190;

  if (!isNarrow && !isOffLuma) {
    return { canvas, applied: false };
  }

  // Compute gamma to nudge mean toward ~120
  let gamma = 1.0;
  if (meanLuma > 10 && meanLuma < 240) {
    // gamma > 1 brightens, gamma < 1 darkens
    gamma = Math.log(120 / 255) / Math.log(meanLuma / 255);
    gamma = Math.max(0.65, Math.min(1.45, gamma));
  }

  // Build LUT
  const lut = new Uint8Array(256);
  const range = Math.max(1, highVal - lowVal);

  for (let i = 0; i < 256; i++) {
    // Levels stretch
    let stretched = ((i - lowVal) / range) * 255;
    stretched = Math.max(0, Math.min(255, stretched));
    // Gamma
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
 * Strictly requires hard evidence: long underline, ruled line, or page border.
 * Will NOT alter natural signature handwriting slant.
 * 
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{x: number, y: number, w: number, h: number, points: Array}>} components
 * @returns {number} Angle in degrees between 1° and 15° (positive or negative), or 0 if no evidence
 */
export function detectSignaturePaperTilt(canvas, components) {
  if (!components || components.length === 0) return 0;

  const w = canvas.width;
  const h = canvas.height;

  // Search for candidate line:
  // Component spanning > 40% of image width or aspect ratio w/h > 8.0
  let candidateLine = null;
  let maxLineWidth = 0;

  for (const comp of components) {
    const aspect = comp.w / Math.max(1, comp.h);
    if ((comp.w > w * 0.40 || aspect > 7.0) && comp.points && comp.points.length > 50) {
      if (comp.w > maxLineWidth) {
        maxLineWidth = comp.w;
        candidateLine = comp;
      }
    }
  }

  if (!candidateLine) return 0;

  // Perform linear regression on candidate points to find slope angle
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
  const angleDeg = (Math.atan(slope) * 180) / Math.PI;

  // Only apply if between 1° and 15° (natural handwriting is often steeper or irregular)
  if (Math.abs(angleDeg) >= 1 && Math.abs(angleDeg) <= 15) {
    return Math.round(angleDeg * 10) / 10;
  }

  return 0;
}
