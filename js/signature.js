// js/signature.js - Pure JavaScript signature extraction, illumination flattening, ink segmentation, and padding fit
import { createCanvas, stepDownDownscale } from './loader.js';

/**
 * Fast separable box blur for illumination background estimation
 */
function boxBlur1D(src, dst, w, h, radius) {
  const scale = 1 / (radius + radius + 1);
  for (let y = 0; y < h; y++) {
    const rowOffset = y * w;
    let sum = 0;
    const firstVal = src[rowOffset];
    const lastVal = src[rowOffset + w - 1];

    for (let i = -radius; i <= radius; i++) {
      const idx = Math.min(Math.max(i, 0), w - 1);
      sum += src[rowOffset + idx];
    }

    for (let x = 0; x < w; x++) {
      dst[rowOffset + x] = sum * scale;
      const leftIdx = Math.max(x - radius, 0);
      const rightIdx = Math.min(x + radius + 1, w - 1);
      sum += src[rowOffset + rightIdx] - src[rowOffset + leftIdx];
    }
  }
}

function boxBlur2D(gray, w, h, radius) {
  const temp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  boxBlur1D(gray, temp, w, h, radius);

  // Transpose blur vertically
  const scale = 1 / (radius + radius + 1);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let i = -radius; i <= radius; i++) {
      const idx = Math.min(Math.max(i, 0), h - 1);
      sum += temp[idx * w + x];
    }
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum * scale;
      const topIdx = Math.max(y - radius, 0);
      const bottomIdx = Math.min(y + radius + 1, h - 1);
      sum += temp[bottomIdx * w + x] - temp[topIdx * w + x];
    }
  }
  return out;
}

/**
 * Otsu's thresholding method on 0..255 normalized data
 */
function otsuThreshold(norm, w, h, marginX, marginY) {
  const hist = new Uint32Array(256);
  let count = 0;

  for (let y = marginY; y < h - marginY; y++) {
    const row = y * w;
    for (let x = marginX; x < w - marginX; x++) {
      hist[Math.round(norm[row + x])]++;
      count++;
    }
  }

  if (count === 0) return 128;

  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let varMax = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = count - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;

    const varBetween = wB * wF * (mB - mF) * (mB - mF);
    if (varBetween > varMax) {
      varMax = varBetween;
      threshold = t;
    }
  }

  return threshold;
}

/**
 * Disjoint Set Union (Union-Find) for connected components
 */
class UnionFind {
  constructor(size) {
    this.parent = new Int32Array(size);
    for (let i = 0; i < size; i++) this.parent[i] = i;
  }
  find(i) {
    let root = i;
    while (root !== this.parent[root]) {
      root = this.parent[root];
    }
    let curr = i;
    while (curr !== root) {
      const next = this.parent[curr];
      this.parent[curr] = root;
      curr = next;
    }
    return root;
  }
  union(i, j) {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) {
      this.parent[rootJ] = rootI;
    }
  }
}

/**
 * Extract connected components from binary mask
 */
function getConnectedComponents(mask, w, h) {
  const labels = new Int32Array(w * h);
  let nextLabel = 1;
  const uf = new UnionFind(Math.floor((w * h) / 4) + 100);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!mask[idx]) continue;

      const up = y > 0 ? labels[(y - 1) * w + x] : 0;
      const left = x > 0 ? labels[y * w + (x - 1)] : 0;

      if (up === 0 && left === 0) {
        labels[idx] = nextLabel++;
      } else if (up !== 0 && left === 0) {
        labels[idx] = up;
      } else if (up === 0 && left !== 0) {
        labels[idx] = left;
      } else {
        labels[idx] = up;
        if (up !== left) {
          uf.union(up, left);
        }
      }
    }
  }

  // Aggregate components
  const compMap = new Map();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const l = labels[idx];
      if (l === 0) continue;
      const root = uf.find(l);
      let comp = compMap.get(root);
      if (!comp) {
        comp = { minX: x, maxX: x, minY: y, maxY: y, count: 0, points: [] };
        compMap.set(root, comp);
      }
      comp.count++;
      if (x < comp.minX) comp.minX = x;
      if (x > comp.maxX) comp.maxX = x;
      if (y < comp.minY) comp.minY = y;
      if (y > comp.maxY) comp.maxY = y;
      if (comp.points.length < 500) {
        comp.points.push({ x, y });
      }
    }
  }

  const components = [];
  for (const [root, c] of compMap.entries()) {
    c.root = root;
    c.w = c.maxX - c.minX + 1;
    c.h = c.maxY - c.minY + 1;
    components.push(c);
  }
  return { components, labels, uf };
}

/**
 * Dilate ink mask for "thicken strokes" feature
 */
function dilateMask(mask, w, h, radius) {
  if (radius <= 0) return mask;
  const r = Math.round(radius);
  const out = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let dy = -r; dy <= r; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          out[ny * w + nx] = 1;
        }
      }
    }
  }
  return out;
}

/**
 * Classifies an image as 'photo' vs 'signature' based on color entropy, skin tones,
 * local grid background/contrast distribution, stroke density, and paper-sheet geometry.
 * Handles full-page documents, cropped strips, and phone photos of notebooks sitting on dark desks.
 */
export function classifyImageContent(canvas) {
  if (!canvas || canvas.width <= 0 || canvas.height <= 0) return 'photo';
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const total = w * h;

  // Fast adaptive stride: sample up to 65,536 well-distributed pixels
  const stride = Math.max(1, Math.floor(Math.sqrt(total / 65536)));

  let sumRg = 0, sumYb = 0, sumRgSq = 0, sumYbSq = 0;
  let skinToneCount = 0;
  let highSatCount = 0;
  let brightPaperCount = 0;
  let darkInkCount = 0;
  let transparentCount = 0;
  let sampleCount = 0;

  // 16x16 spatial grid to measure paper regions, dark desk borders, and local ink strokes
  const GRID = 16;
  const numCells = GRID * GRID;
  const cellTotal = new Int32Array(numCells);
  const cellNonPaper = new Int32Array(numCells);
  const cellSumLuma = new Float64Array(numCells);
  const cellSumSat = new Float64Array(numCells);
  const cellMinLuma = new Float32Array(numCells).fill(255);
  const cellMaxLuma = new Float32Array(numCells).fill(0);
  const cellSmoothCount = new Int32Array(numCells);
  const cellEdgeCount = new Int32Array(numCells);
  const cellSkinCount = new Int32Array(numCells);

  for (let y = 0; y < h; y += stride) {
    const rowOffset = y * w * 4;
    const nextRowOffset = Math.min(h - 1, y + stride) * w * 4;
    const gy = Math.min(GRID - 1, Math.floor((y / h) * GRID));
    for (let x = 0; x < w; x += stride) {
      const i = rowOffset + x * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      const gx = Math.min(GRID - 1, Math.floor((x / w) * GRID));
      const cellIdx = gy * GRID + gx;
      cellTotal[cellIdx]++;
      sampleCount++;

      // Transparent background pixels (e.g. PNG digital signatures or transparent text stickers)
      if (a < 64) {
        transparentCount++;
        brightPaperCount++;
        cellSumLuma[cellIdx] += 255;
        cellSmoothCount[cellIdx]++;
        if (255 > cellMaxLuma[cellIdx]) cellMaxLuma[cellIdx] = 255;
        continue;
      }

      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      // Dampen saturation in very dark shadow pixels (max < 75) so dark navy/black backgrounds don't report 65% saturation from minor RGB noise
      const sat = max === 0 ? 0 : (max - min) / Math.max(75, max);

      cellSumLuma[cellIdx] += luma;
      cellSumSat[cellIdx] += sat;
      if (luma < cellMinLuma[cellIdx]) cellMinLuma[cellIdx] = luma;
      if (luma > cellMaxLuma[cellIdx]) cellMaxLuma[cellIdx] = luma;

      // Local gradient check (distinguishes flat smooth paper from textured 3D objects and sharp pen strokes)
      const rightIdx = rowOffset + Math.min(w - 1, x + stride) * 4;
      const downIdx = nextRowOffset + x * 4;
      const lumaR = 0.299 * data[rightIdx] + 0.587 * data[rightIdx + 1] + 0.114 * data[rightIdx + 2];
      const lumaD = 0.299 * data[downIdx] + 0.587 * data[downIdx + 1] + 0.114 * data[downIdx + 2];
      const localGrad = Math.abs(luma - lumaR) + Math.abs(luma - lumaD);
      if (localGrad < 10) {
        cellSmoothCount[cellIdx]++;
      } else if (localGrad >= 22) {
        cellEdgeCount[cellIdx]++;
      }

      // Detect white/off-white/cream/ruled paper surfaces (including warm indoor phone camera shadows down to luma 90)
      const isPaper = (luma > 150 && sat < 0.25 && Math.abs(r - g) < 28 && (r - b) < 46) ||
                      (luma > 92 && sat < 0.22 && localGrad < 12 && Math.abs(r - g) < 20 && (r - b) < 34);
      if (isPaper) {
        brightPaperCount++;
      } else {
        cellNonPaper[cellIdx]++;
      }

      // Detect dark ink, black gel pen, blue ballpoint pen, red ink, or anti-aliased stroke edges
      const isDarkInk = (luma < 120);
      const isBlueInk = (b > r + 14 && b > g + 8 && luma < 185);
      const isRedInk = (r > g + 32 && r > b + 32 && luma < 170);
      if (isDarkInk || isBlueInk || isRedInk) {
        darkInkCount++;
      }

      const rg = r - g;
      const yb = 0.5 * (r + g) - b;
      sumRg += rg;
      sumYb += yb;
      sumRgSq += rg * rg;
      sumYbSq += yb * yb;

      // True human skin tone detection (strictly rejects warm indoor paper where sat < 0.20 and r - g < 18,
      // while supporting studio-lit fair/bright skin up to luma 242 when saturation and warm chroma are strong)
      if (!isPaper) {
        const isSkin = sat >= 0.20 && luma >= 45 && luma <= 242 && r > g && g >= b && (
          ((r - g) >= 18 && (r - b) >= 28 && r > 85 && b < 195 && sat <= 0.65 && (luma <= 218 || (sat >= 0.24 && (r - b) >= 40))) ||
          (luma >= 45 && luma <= 115 && sat >= 0.24 && (r - g) >= 15 && (r - b) >= 25)
        );
        if (isSkin) {
          skinToneCount++;
          cellSkinCount[cellIdx]++;
        }
      }

      if (sat > 0.30 && max > 50) highSatCount++;
    }
  }

  if (sampleCount === 0) return 'photo';

  // Analyze the 16x16 spatial grid for:
  // (a) Paper sheet cells (smooth, low-chroma surface with luma >= 84)
  // (b) Paper cells containing pen/text strokes (high local dynamic range + sharp stroke edges)
  // (c) Dark or uniform desk/table background cells (e.g. black desk, wooden table around paper slip)
  // (d) Central portrait subject cells (dense non-paper cells in the center/bottom-center with skin or 3D shading)
  let activeCells = 0;
  let solidCells = 0;
  let paperCells = 0;
  let paperStrokeCells = 0;
  let darkDeskCells = 0;
  let darkStrokeCells = 0;
  let uniformDeskCells = 0;
  let centerSubjectCells = 0;
  let centerPaperCells = 0;

  for (let c = 0; c < numCells; c++) {
    const n = cellTotal[c];
    if (n <= 0) continue;
    activeCells++;

    const gx = c % GRID;
    const gy = Math.floor(c / GRID);
    const meanLuma = cellSumLuma[c] / n;
    const meanSat = cellSumSat[c] / n;
    const smoothFrac = cellSmoothCount[c] / n;
    const edgeFrac = cellEdgeCount[c] / n;
    const skinFrac = cellSkinCount[c] / n;
    const lumaRange = cellMaxLuma[c] - cellMinLuma[c];

    const isCenterCol = gx >= 3 && gx <= 12;
    const isCenterBodyZone = gx >= 4 && gx <= 11 && gy >= 4 && gy <= 12;

    // Dark desk / background cell (very dark, low saturation, mostly smooth or containing thin white inverted strokes)
    if ((meanLuma < 60 || (cellMinLuma[c] < 45 && cellMaxLuma[c] >= 140 && meanLuma < 115)) && meanSat < 0.35 && smoothFrac >= 0.40 && skinFrac < 0.02) {
      darkDeskCells++;
      uniformDeskCells++;
      if (cellMaxLuma[c] >= 140 && lumaRange >= 85 && edgeFrac >= 0.012) {
        darkStrokeCells++;
      }
    }
    // Paper sheet cell (either blank smooth paper or paper with thin dark ink strokes)
    else if (meanLuma >= 84 && cellMaxLuma[c] >= 110 && meanSat < 0.25 && skinFrac < 0.03 && (smoothFrac >= 0.48 || (smoothFrac >= 0.30 && edgeFrac >= 0.04 && lumaRange >= 45))) {
      paperCells++;
      if (isCenterBodyZone) centerPaperCells++;
      // Does this paper cell contain ink strokes?
      if (lumaRange >= 42 && edgeFrac >= 0.015 && cellMinLuma[c] < meanLuma - 22) {
        paperStrokeCells++;
      }
    }
    // Flat uniform wooden/colored desk or wall cell (smooth, textureless surface)
    else if (smoothFrac >= 0.76 && lumaRange < 30 && edgeFrac < 0.015) {
      uniformDeskCells++;
    } else if (cellNonPaper[c] / n > 0.72) {
      solidCells++;
      if (isCenterCol && gy >= 3 && gy <= 14 && meanLuma >= 35) {
        centerSubjectCells++;
      }
    }
  }

  const solidCellRatio = activeCells > 0 ? solidCells / activeCells : 0;
  const nonDeskCells = Math.max(1, activeCells - uniformDeskCells);
  const paperShareOfNonDesk = paperCells / nonDeskCells;
  const paperTotalRatio = activeCells > 0 ? paperCells / activeCells : 0;
  const darkDeskRatio = activeCells > 0 ? darkDeskCells / activeCells : 0;

  const meanRg = sumRg / sampleCount;
  const meanYb = sumYb / sampleCount;
  const stdRg = Math.sqrt(Math.max(0, sumRgSq / sampleCount - meanRg * meanRg));
  const stdYb = Math.sqrt(Math.max(0, sumYbSq / sampleCount - meanYb * meanYb));
  const colorfulness = Math.sqrt(stdRg * stdRg + stdYb * stdYb) + 0.3 * Math.sqrt(meanRg * meanRg + meanYb * meanYb);

  const skinRatio = skinToneCount / sampleCount;
  const satRatio = highSatCount / sampleCount;
  const paperRatio = brightPaperCount / sampleCount;
  const inkRatio = darkInkCount / sampleCount;
  const transparentRatio = transparentCount / sampleCount;
  const bimodalRatio = paperRatio + inkRatio;
  const aspect = w / h;

  // 1. Transparent PNG with ink/text strokes and low skin -> Definite Signature / Text graphic
  // Require (transparentRatio + inkRatio) >= 0.88 so cutout portrait PNGs on transparent backgrounds (like face_trans.png) are never mistaken for signatures!
  if (transparentRatio > 0.35 && (transparentRatio + inkRatio) >= 0.88 && inkRatio > 0.0003 && inkRatio < 0.40 && skinRatio < 0.02 && solidCellRatio < 0.12) {
    return 'signature';
  }

  // 1b. Inverted White-on-Dark Signature (exact bimodal mirror of dark-on-white: dark background >= 65% + bright white strokes 0.05%..25%)
  if (
    (darkDeskRatio >= 0.60 || inkRatio >= 0.65) &&
    bimodalRatio >= 0.80 &&
    paperRatio >= 0.0005 &&
    paperRatio <= 0.25 &&
    skinRatio < 0.02 &&
    satRatio < 0.08 &&
    colorfulness < 24
  ) {
    return 'signature';
  }

  // 2. Wide banner aspect ratio (>= 1.75, e.g. 300x80, 250x50, cropped signature strip, text banner)
  if (aspect >= 1.75 && (paperRatio >= 0.40 || paperShareOfNonDesk >= 0.50) && inkRatio > 0.0003 && skinRatio < 0.03 && solidCellRatio < 0.25) {
    return 'signature';
  }

  // 3. Notebook / Paper Slip with Ink Strokes on ANY Desk Surface (Dark desk, Wooden table, Colored mat on 1, 2, or all 4 sides)
  // In a photo of a paper slip on a desk, the central region is occupied by smooth paper cells (centerPaperCells) containing sharp ink strokes (paperStrokeCells >= 2),
  // whereas in a portrait photo the central region is occupied by the human subject (centerSubjectCells).
  if (
    paperTotalRatio >= 0.15 &&
    paperShareOfNonDesk >= 0.50 &&
    centerPaperCells >= 6 &&
    paperStrokeCells >= 2 &&
    centerPaperCells > centerSubjectCells * 2.5 &&
    ((skinRatio < 0.025 && satRatio < 0.08 && colorfulness < 24) || (uniformDeskCells >= activeCells * 0.25 && centerSubjectCells === 0))
  ) {
    return 'signature';
  }

  // 4. Definite Photos: significant human skin tones, rich multi-color scene, or large central portrait subject mass
  if (skinRatio > 0.025 || (colorfulness > 24 && satRatio > 0.12) || solidCellRatio > 0.22 || inkRatio > 0.38) {
    return 'photo';
  }

  // 5. Signatures & Text-Based Pictures on Paper (works for ANY aspect ratio: 16:9, 4:3, 1:1, or 3:4 phone photo of paper)
  if (paperRatio >= 0.50 && bimodalRatio >= 0.74 && inkRatio >= 0.0003 && inkRatio <= 0.36 && skinRatio < 0.02 && solidCellRatio < 0.14 && colorfulness < 24) {
    return 'signature';
  }

  // 6. Shaded / dimly lit phone photo of paper with handwriting or text
  if (paperTotalRatio >= 0.42 && paperStrokeCells >= 1 && skinRatio < 0.018 && solidCellRatio < 0.12 && colorfulness < 20) {
    return 'signature';
  }

  return 'photo';
}

/**
 * Extracts an alpha mask for signature strokes (foreground ink = 255 alpha, background = 0).
 * Used by the manual editor brush and AI background removal for signature presets.
 * 
 * @param {HTMLCanvasElement} sourceCanvas
 * @returns {HTMLCanvasElement|null}
 */
export function extractSignatureMask(sourceCanvas) {
  if (!sourceCanvas || sourceCanvas.width <= 0 || sourceCanvas.height <= 0) return null;
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const res = processSignature(sourceCanvas, w, h, {
    keepInkColor: false,
    thickenPx: 0,
    useFullImage: true,
    transparent: true,
    bgColor: '#ffffff'
  });
  if (res && res.canvas) {
    const mCtx = res.canvas.getContext('2d', { willReadFrequently: true });
    const imgData = mCtx.getImageData(0, 0, w, h);
    const md = imgData.data;
    for (let i = 0; i < md.length; i += 4) {
      md[i] = 255;
      md[i + 1] = 255;
      md[i + 2] = 255;
    }
    mCtx.putImageData(imgData, 0, 0);
    return res.canvas;
  }
  return null;
}

/**
 * Main signature analysis & extraction function
 * Isolates the paper sheet (ignoring dark desks, spiral notebook bindings, punched holes, and border shadows),
 * clusters and extracts the primary signature, flattens illumination to pure white, and normalizes ink contrast.
 * 
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {Object} options
 * @param {boolean} [options.keepInkColor=false]
 * @param {number} [options.thickenPx=0]
 * @param {boolean} [options.useFullImage=false]
 * @param {boolean} [options.transparent=false]
 * @param {string} [options.bgColor='#ffffff']
 */
export function processSignature(sourceCanvas, targetW, targetH, options = {}) {
  const {
    keepInkColor = false,
    thickenPx = 0,
    useFullImage = false,
    transparent = false,
    bgColor = '#ffffff'
  } = options;

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, w, h);
  const src = imgData.data;

  // Step 1: Alpha-composite onto white (fixes transparent PNG signatures like sig_transparent.png)
  // and compute Grayscale (luma), Min(R,G,B), and Saturation channels
  const gray = new Float32Array(w * h);
  const minRGB = new Float32Array(w * h);
  const satArr = new Float32Array(w * h);
  let sumLuma = 0, sumMin = 0;

  for (let i = 0, j = 0; i < src.length; i += 4, j++) {
    const a = src[i + 3] / 255;
    const r = src[i] * a + 255 * (1 - a);
    const g = src[i + 1] * a + 255 * (1 - a);
    const b = src[i + 2] * a + 255 * (1 - a);

    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const m = Math.min(r, g, b);
    const mx = Math.max(r, g, b);
    gray[j] = luma;
    minRGB[j] = m;
    satArr[j] = mx === 0 ? 0 : (mx - m) / Math.max(75, mx);
    sumLuma += luma;
    sumMin += m;
  }

  // Use channel with better dynamic contrast (lower mean darkness)
  const activeGray = (sumMin / (w * h) < sumLuma / (w * h) * 0.9) ? minRGB : gray;

  // Step 1b: Polarity check BEFORE illumination estimation
  // If the entire image is a white/bright signature on a dark background (e.g. sig_inverted.jpg),
  // invert activeGray first so bgEstimate and norm treat the background as bright paper and strokes as dark ink!
  const rawSamples = [];
  const rawStep = Math.max(1, Math.floor(activeGray.length / 2500));
  for (let i = 0; i < activeGray.length; i += rawStep) {
    rawSamples.push(activeGray[i]);
  }
  rawSamples.sort((a, b) => a - b);
  const rawMedian = rawSamples[Math.floor(rawSamples.length * 0.50)] || 128;
  const rawP80 = rawSamples[Math.floor(rawSamples.length * 0.80)] || 180;
  const isInverted = rawMedian < 70 && rawP80 < 95;

  if (isInverted) {
    for (let i = 0; i < activeGray.length; i++) {
      activeGray[i] = 255 - activeGray[i];
      satArr[i] = 0;
    }
  }

  // Step 2: Illumination correction with large-radius box blur (~5% of longest side)
  const blurRadius = Math.max(8, Math.round(Math.max(w, h) * 0.05));
  const bgEstimate = boxBlur2D(activeGray, w, h, blurRadius);
  const bgSatEstimate = boxBlur2D(satArr, w, h, Math.max(6, Math.round(blurRadius * 0.5)));

  // Step 2b: Detect paper sheet illumination & chroma reference
  // Separates the bright/shaded low-chroma paper surface from any dark desk, brown wooden table, or colored mat outside the paper.
  const bgSamples = [];
  const satSamples = [];
  const bgStep = Math.max(1, Math.floor(bgEstimate.length / 2500));
  for (let i = 0; i < bgEstimate.length; i += bgStep) {
    bgSamples.push(bgEstimate[i]);
    if (bgEstimate[i] >= 95) satSamples.push(bgSatEstimate[i]);
  }
  bgSamples.sort((a, b) => a - b);
  satSamples.sort((a, b) => a - b);
  const paperRefBg = bgSamples[Math.floor(bgSamples.length * 0.80)] || 180;
  const paperRefSat = satSamples.length > 0 ? (satSamples[Math.floor(satSamples.length * 0.35)] || 0.08) : 0.08;

  const hasBrightPaperSheet = paperRefBg >= 95;
  const minPaperBg = hasBrightPaperSheet ? Math.max(58, paperRefBg * 0.55) : 0;
  const maxPaperSat = Math.min(0.42, paperRefSat + 0.22);

  const isPaperSurface = (idx) => {
    if (!hasBrightPaperSheet) return true;
    return bgEstimate[idx] >= minPaperBg && bgSatEstimate[idx] <= maxPaperSat;
  };

  // Detect 4-sided physical paper boundaries (Top, Bottom, Left, Right)
  let paperTopY = 0;
  let paperBottomY = h - 1;
  let paperLeftX = 0;
  let paperRightX = w - 1;

  if (hasBrightPaperSheet) {
    const xStart = Math.round(w * 0.12);
    const xEnd = Math.round(w * 0.88);
    const xSpan = Math.max(1, xEnd - xStart);

    // Scan from top to find first row that is predominantly paper
    for (let y = 0; y < h; y++) {
      let paperRowPixels = 0;
      const rowOff = y * w;
      for (let x = xStart; x < xEnd; x += 2) {
        const idx = rowOff + x;
        if (isPaperSurface(idx) && activeGray[idx] >= minPaperBg * 0.75) {
          paperRowPixels += 2;
        }
      }
      if (paperRowPixels / xSpan >= 0.45) {
        paperTopY = y;
        break;
      }
    }

    // Scan from bottom to find last row that is predominantly paper
    for (let y = h - 1; y >= paperTopY; y--) {
      let paperRowPixels = 0;
      const rowOff = y * w;
      for (let x = xStart; x < xEnd; x += 2) {
        const idx = rowOff + x;
        if (isPaperSurface(idx) && activeGray[idx] >= minPaperBg * 0.75) {
          paperRowPixels += 2;
        }
      }
      if (paperRowPixels / xSpan >= 0.45) {
        paperBottomY = y;
        break;
      }
    }

    const yStart = Math.max(paperTopY, Math.round(h * 0.12));
    const yEnd = Math.min(paperBottomY, Math.round(h * 0.88));
    const ySpan = Math.max(1, yEnd - yStart);

    // Scan from left to find first column that is predominantly paper
    for (let x = 0; x < w; x++) {
      let paperColPixels = 0;
      for (let y = yStart; y < yEnd; y += 2) {
        const idx = y * w + x;
        if (isPaperSurface(idx) && activeGray[idx] >= minPaperBg * 0.75) {
          paperColPixels += 2;
        }
      }
      if (paperColPixels / ySpan >= 0.45) {
        paperLeftX = x;
        break;
      }
    }

    // Scan from right to find last column that is predominantly paper
    for (let x = w - 1; x >= paperLeftX; x--) {
      let paperColPixels = 0;
      for (let y = yStart; y < yEnd; y += 2) {
        const idx = y * w + x;
        if (isPaperSurface(idx) && activeGray[idx] >= minPaperBg * 0.75) {
          paperColPixels += 2;
        }
      }
      if (paperColPixels / ySpan >= 0.45) {
        paperRightX = x;
        break;
      }
    }
  }

  // Compute illumination-flattened normalized image (255 = pure paper, < 255 = darker strokes)
  // Pixels outside the paper sheet (in a dark or wooden desk/background) are clamped to 255 (paper white) so they never become fake ink.
  const norm = new Float32Array(w * h);
  for (let i = 0; i < norm.length; i++) {
    if (!isPaperSurface(i)) {
      norm[i] = 255;
      continue;
    }
    const bgVal = Math.max(1, bgEstimate[i]);
    const val = (activeGray[i] / bgVal) * 255;
    norm[i] = Math.max(0, Math.min(255, val));
  }

  // Step 5: Ignore outer 2.5% margin + any non-paper desk band on all 4 sides (top/bottom/left/right)
  const marginX = Math.round(w * 0.025);
  const marginY = Math.round(h * 0.025);
  const hasTopDeskBoundary = paperTopY > h * 0.04;
  const hasBottomDeskBoundary = paperBottomY < h * 0.96;
  const hasLeftDeskBoundary = paperLeftX > w * 0.04;
  const hasRightDeskBoundary = paperRightX < w * 0.96;

  const effectiveTopY = Math.max(marginY, hasTopDeskBoundary ? Math.min(h - marginY - 10, paperTopY + Math.round(h * 0.025)) : marginY);
  const effectiveBottomY = Math.min(h - marginY, hasBottomDeskBoundary ? Math.max(effectiveTopY + 10, paperBottomY - Math.round(h * 0.025)) : h - marginY);
  const effectiveLeftX = Math.max(marginX, hasLeftDeskBoundary ? Math.min(w - marginX - 10, paperLeftX + Math.round(w * 0.025)) : marginX);
  const effectiveRightX = Math.min(w - marginX, hasRightDeskBoundary ? Math.max(effectiveLeftX + 10, paperRightX - Math.round(w * 0.025)) : w - marginX);

  // Step 4: Otsu thresholding on the valid paper region
  let threshold = otsuThreshold(norm, w, h, Math.max(marginX, Math.floor(effectiveLeftX * 0.8)), Math.max(marginY, Math.floor(effectiveTopY * 0.8)));
  // Ensure threshold is tight enough to reject subtle paper shading noise (cap at <= 222)
  threshold = Math.min(222, threshold);

  // Initial ink mask (ink pixels are darker than local paper background, so norm < threshold)
  let mask = new Uint8Array(w * h);
  let inkCount = 0;
  const analysisCount = Math.max(1, (effectiveRightX - effectiveLeftX) * (effectiveBottomY - effectiveTopY));

  for (let y = effectiveTopY; y < effectiveBottomY; y++) {
    const row = y * w;
    for (let x = effectiveLeftX; x < effectiveRightX; x++) {
      const idx = row + x;
      if (!isPaperSurface(idx)) continue;
      if (norm[idx] < threshold) {
        mask[idx] = 1;
        inkCount++;
      }
    }
  }

  let inkFraction = inkCount / analysisCount;

  // Sanity check: if ink fraction > 28% or < 0.05%, retry with darkest 3% of paper pixels
  let warnings = [];
  if (inkFraction > 0.28 || inkFraction < 0.0005) {
    const paperNormSamples = [];
    for (let y = effectiveTopY; y < effectiveBottomY; y += 2) {
      const row = y * w;
      for (let x = effectiveLeftX; x < effectiveRightX; x += 2) {
        const idx = row + x;
        if (isPaperSurface(idx)) {
          paperNormSamples.push(norm[idx]);
        }
      }
    }
    paperNormSamples.sort((a, b) => a - b);
    const p3Index = Math.floor(paperNormSamples.length * 0.03);
    threshold = Math.min(215, paperNormSamples[p3Index] || 170);

    mask = new Uint8Array(w * h);
    inkCount = 0;
    for (let y = effectiveTopY; y < effectiveBottomY; y++) {
      const row = y * w;
      for (let x = effectiveLeftX; x < effectiveRightX; x++) {
        const idx = row + x;
        if (!isPaperSurface(idx)) continue;
        if (norm[idx] < threshold) {
          mask[idx] = 1;
          inkCount++;
        }
      }
    }
    inkFraction = inkCount / analysisCount;
  }

  if (inkFraction < 0.0002) {
    // Blank page or no signature found
    const outCanvas = createCanvas(targetW, targetH);
    const outCtx = outCanvas.getContext('2d');
    outCtx.fillStyle = bgColor;
    outCtx.fillRect(0, 0, targetW, targetH);
    if (w > 0 && h > 0 && sourceCanvas && sourceCanvas.width > 0 && sourceCanvas.height > 0) {
      const scale = Math.min(targetW / w, targetH / h);
      const dw = Math.max(1, Math.round(w * scale));
      const dh = Math.max(1, Math.round(h * scale));
      outCtx.drawImage(sourceCanvas, (targetW - dw) / 2, (targetH - dh) / 2, dw, dh);
    }

    return {
      success: false,
      warning: 'warnNoSignature',
      bbox: { x: 0, y: 0, w: Math.max(1, w), h: Math.max(1, h) },
      components: [],
      canvas: outCanvas,
      inkAspect: 1.0
    };
  }

  // Step 5b: Strip thin full-width horizontal ruled lines (and thin full-height vertical margin lines)
  // before Connected Component Labeling so signatures crossing lined notebook paper never merge with full-width lines!
  const paperSpanW = Math.max(1, effectiveRightX - effectiveLeftX);
  const paperSpanH = Math.max(1, effectiveBottomY - effectiveTopY);
  const maxRuledThickness = Math.max(3, Math.round(Math.min(w, h) * 0.008));

  for (let y = effectiveTopY; y < effectiveBottomY; y++) {
    let rowInk = 0;
    let thinVertRuns = 0;
    const rowOff = y * w;
    for (let x = effectiveLeftX; x < effectiveRightX; x++) {
      if (mask[rowOff + x]) {
        rowInk++;
        // Check vertical thickness of ink at (x, y)
        let vRun = 1;
        for (let dy = 1; dy <= maxRuledThickness + 1 && y - dy >= 0; dy++) {
          if (mask[(y - dy) * w + x]) vRun++; else break;
        }
        for (let dy = 1; dy <= maxRuledThickness + 1 && y + dy < h; dy++) {
          if (mask[(y + dy) * w + x]) vRun++; else break;
        }
        if (vRun <= maxRuledThickness) thinVertRuns++;
      }
    }
    // If > 68% of the paper width on this row is covered by a thin horizontal line, clear the thin line segments
    // while keeping thicker signature strokes (vRun > maxRuledThickness) intact!
    if (rowInk > paperSpanW * 0.68 && thinVertRuns > rowInk * 0.72) {
      for (let x = effectiveLeftX; x < effectiveRightX; x++) {
        if (!mask[rowOff + x]) continue;
        let vRun = 1;
        for (let dy = 1; dy <= maxRuledThickness + 1 && y - dy >= 0; dy++) {
          if (mask[(y - dy) * w + x]) vRun++; else break;
        }
        for (let dy = 1; dy <= maxRuledThickness + 1 && y + dy < h; dy++) {
          if (mask[(y + dy) * w + x]) vRun++; else break;
        }
        if (vRun <= maxRuledThickness) {
          mask[rowOff + x] = 0;
        }
      }
    }
  }

  // Step 6: Connected components denoise + 4-Sided Spiral Binding / Border Frame / Outlier Rejection
  const { components, labels, uf } = getConnectedComponents(mask, w, h);
  const totalArea = w * h;

  // Define 4-sided spiral binding / punched-hole hazard zones along Top, Bottom, Left, and Right paper edges
  const topHazardMaxY = (hasTopDeskBoundary ? paperTopY : 0) + Math.round(h * 0.125);
  const bottomHazardMinY = (hasBottomDeskBoundary ? paperBottomY : h - 1) - Math.round(h * 0.125);
  const leftHazardMaxX = (hasLeftDeskBoundary ? paperLeftX : 0) + Math.round(w * 0.135);
  const rightHazardMinX = (hasRightDeskBoundary ? paperRightX : w - 1) - Math.round(w * 0.135);

  // Detect hollow rectangular enclosing border frames (e.g. sig_with_border.png or printed signature boxes on forms)
  const isHollowBorderFrame = (c) => {
    const boxArea = c.w * c.h;
    const fillDensity = c.count / Math.max(1, boxArea);
    if (c.w > w * 0.58 && c.h > h * 0.45 && boxArea > totalArea * 0.28 && fillDensity < 0.15) {
      // Verify at least one substantial interior component sits strictly inside this frame
      return components.some(inner =>
        inner !== c &&
        inner.count > totalArea * 0.0003 &&
        inner.minX > c.minX + 3 && inner.maxX < c.maxX - 3 &&
        inner.minY > c.minY + 3 && inner.maxY < c.maxY - 3
      );
    }
    return false;
  };

  // Identify substantial interior components (not a hollow border frame, not in any 4-sided spiral hazard zone, and not touching outer borders)
  const interiorLargeComps = components.filter(c => {
    if (c.count <= totalArea * 0.0004) return false;
    if (isHollowBorderFrame(c)) return false;
    const inTopSpiral = c.maxY <= topHazardMaxY;
    const inBottomSpiral = c.minY >= bottomHazardMinY;
    const inLeftSpiral = c.maxX <= leftHazardMaxX;
    const inRightSpiral = c.minX >= rightHazardMinX;
    const touchesOuterEdge = c.minY <= effectiveTopY + 3 || c.maxY >= effectiveBottomY - 3 ||
                             c.minX <= effectiveLeftX + 3 || c.maxX >= effectiveRightX - 3;
    return !inTopSpiral && !inBottomSpiral && !inLeftSpiral && !inRightSpiral && !touchesOuterEdge;
  });

  const referenceLargeComps = interiorLargeComps.length > 0
    ? interiorLargeComps
    : components.filter(c => c.count > totalArea * 0.0005 && !isHollowBorderFrame(c));

  const candidateComponents = [];

  for (const c of components) {
    // Rule A1: Drop hollow rectangular border frames enclosing the signature (e.g. sig_with_border.png)
    if (isHollowBorderFrame(c)) {
      continue;
    }

    // Rule A2: Drop ultra-thin straight border/ruled notebook lines spanning > 75% of image width or height
    if (c.w > w * 0.75 && c.h <= Math.max(4, Math.round(h * 0.016)) && (c.w / Math.max(1, c.h)) > 35 && referenceLargeComps.length > 1) {
      continue;
    }
    if (c.h > h * 0.75 && c.w <= Math.max(4, Math.round(w * 0.016)) && (c.h / Math.max(1, c.w)) > 35 && referenceLargeComps.length > 1) {
      continue;
    }

    // Rule B: If we have valid interior signature components, reject spiral binding / punched holes along ALL 4 paper edges
    // and reject cut-off stray marks touching the outer frame borders!
    if (interiorLargeComps.length > 0) {
      // 1. Top or Bottom spiral binding / punched-hole zone
      if (c.maxY <= topHazardMaxY + Math.round(h * 0.02) && (hasTopDeskBoundary || c.minY <= effectiveTopY + Math.round(h * 0.04) || c.w < w * 0.14)) {
        continue;
      }
      if (c.minY >= bottomHazardMinY - Math.round(h * 0.02) && (hasBottomDeskBoundary || c.maxY >= effectiveBottomY - Math.round(h * 0.04) || c.w < w * 0.14)) {
        continue;
      }
      // 2. Left or Right spiral binding / punched-hole zone (e.g. left-bound spiral notebook)
      if (c.maxX <= leftHazardMaxX + Math.round(w * 0.02) && (hasLeftDeskBoundary || c.minX <= effectiveLeftX + Math.round(w * 0.04) || c.h < h * 0.14)) {
        continue;
      }
      if (c.minX >= rightHazardMinX - Math.round(w * 0.02) && (hasRightDeskBoundary || c.maxX >= effectiveRightX - Math.round(w * 0.04) || c.h < h * 0.14)) {
        continue;
      }
      // 3. Component touches any of the 4 outer paper/frame boundaries and doesn't span the central signature area
      const touchesTop = c.minY <= effectiveTopY + Math.round(h * 0.015) && c.maxY < h * 0.48;
      const touchesBottom = c.maxY >= effectiveBottomY - Math.max(4, Math.round(h * 0.015)) && c.minY > h * 0.52;
      const touchesLeft = c.minX <= effectiveLeftX + Math.round(w * 0.015) && c.maxX < w * 0.42;
      const touchesRight = c.maxX >= effectiveRightX - Math.max(4, Math.round(w * 0.015)) && c.minX > w * 0.58;
      if (touchesTop || touchesBottom || touchesLeft || touchesRight) {
        continue;
      }
    }

    // Rule C: Specks smaller than 0.02% of area
    if (c.count < totalArea * 0.0002) {
      let closeToLarge = false;
      const cx = (c.minX + c.maxX) / 2;
      const cy = (c.minY + c.maxY) / 2;
      for (const lc of referenceLargeComps) {
        if ( cx >= lc.minX - lc.w * 0.25 && cx <= lc.maxX + lc.w * 0.25 &&
             cy >= lc.minY - Math.max(20, lc.h * 0.45) && cy <= lc.maxY + Math.max(20, lc.h * 0.45) ) {
          closeToLarge = true;
          break;
        }
      }
      if (!closeToLarge) continue;
    }

    candidateComponents.push(c);
  }

  // Step 6b: Primary Signature Cluster Isolation
  // Group candidate components into horizontal signature bands so distant outlier noise
  // (like any remaining hole or distant stray mark) never stretches the signature crop box!
  let keptComponents = candidateComponents;
  if (candidateComponents.length > 1) {
    const gapY = Math.max(16, Math.round(h * 0.055));
    const gapX = Math.max(24, Math.round(w * 0.12));
    const clusters = [];

    for (const comp of candidateComponents) {
      let merged = false;
      for (const cl of clusters) {
        const overlapY = comp.minY <= cl.maxY + gapY && comp.maxY >= cl.minY - gapY;
        const overlapX = comp.minX <= cl.maxX + gapX && comp.maxX >= cl.minX - gapX;
        if (overlapY && overlapX) {
          cl.comps.push(comp);
          cl.count += comp.count;
          cl.minX = Math.min(cl.minX, comp.minX);
          cl.maxX = Math.max(cl.maxX, comp.maxX);
          cl.minY = Math.min(cl.minY, comp.minY);
          cl.maxY = Math.max(cl.maxY, comp.maxY);
          cl.w = cl.maxX - cl.minX + 1;
          cl.h = cl.maxY - cl.minY + 1;
          merged = true;
          break;
        }
      }
      if (!merged) {
        clusters.push({
          comps: [comp],
          count: comp.count,
          minX: comp.minX,
          maxX: comp.maxX,
          minY: comp.minY,
          maxY: comp.maxY,
          w: comp.w,
          h: comp.h
        });
      }
    }

    // Merge clusters that now overlap after growth
    let changed = true;
    while (changed && clusters.length > 1) {
      changed = false;
      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const a = clusters[i];
          const b = clusters[j];
          const overlapY = a.minY <= b.maxY + gapY && a.maxY >= b.minY - gapY;
          const overlapX = a.minX <= b.maxX + gapX && a.maxX >= b.minX - gapX;
          if (overlapY && overlapX) {
            a.comps.push(...b.comps);
            a.count += b.count;
            a.minX = Math.min(a.minX, b.minX);
            a.maxX = Math.max(a.maxX, b.maxX);
            a.minY = Math.min(a.minY, b.minY);
            a.maxY = Math.max(a.maxY, b.maxY);
            a.w = a.maxX - a.minX + 1;
            a.h = a.maxY - a.minY + 1;
            clusters.splice(j, 1);
            changed = true;
            break;
          }
        }
        if (changed) break;
      }
    }

    if (clusters.length > 1) {
      const paperCenterY = (effectiveTopY + effectiveBottomY) / 2;
      const paperCenterX = (effectiveLeftX + effectiveRightX) / 2;

      for (const cl of clusters) {
        const cy = (cl.minY + cl.maxY) / 2;
        const cx = (cl.minX + cl.maxX) / 2;
        const distFromPaperCenterY = Math.abs(cy - paperCenterY) / (paperSpanH * 0.5);
        const distFromPaperCenterX = Math.abs(cx - paperCenterX) / (paperSpanW * 0.5);
        const centerWeight = Math.max(0.30, 1.15 - (distFromPaperCenterY * 0.45 + distFromPaperCenterX * 0.35));
        // Penalize clusters that look like a row or column of small disconnected holes
        const avgCompW = cl.comps.reduce((acc, c) => acc + c.w, 0) / cl.comps.length;
        const avgCompH = cl.comps.reduce((acc, c) => acc + c.h, 0) / cl.comps.length;
        const isBorderHoleRowOrCol = cl.comps.length >= 3 && avgCompW < w * 0.07 && avgCompH < h * 0.07 &&
          (cl.minY < effectiveTopY + paperSpanH * 0.22 || cl.maxY > effectiveBottomY - paperSpanH * 0.22 ||
           cl.minX < effectiveLeftX + paperSpanW * 0.22 || cl.maxX > effectiveRightX - paperSpanW * 0.22);
        const holePenalty = isBorderHoleRowOrCol ? 0.08 : 1.0;
        cl.score = cl.count * Math.pow(Math.max(10, cl.w), 0.65) * centerWeight * holePenalty;
      }

      clusters.sort((a, b) => b.score - a.score);
      const mainCluster = clusters[0];
      const finalComps = [...mainCluster.comps];

      // Include secondary clusters ONLY if they are part of the same horizontal signature line,
      // or a legitimate multi-line signature block (comparable width & close vertically, not near borders)
      for (let i = 1; i < clusters.length; i++) {
        const cl = clusters[i];
        const vertDist = Math.max(0, cl.minY - mainCluster.maxY, mainCluster.minY - cl.maxY);
        const horizDist = Math.max(0, cl.minX - mainCluster.maxX, mainCluster.minX - cl.maxX);
        const sameLineWord = vertDist <= Math.max(20, mainCluster.h * 0.45) && horizDist <= w * 0.24 &&
                             cl.minX > effectiveLeftX + w * 0.05 && cl.maxX < effectiveRightX - w * 0.05;
        const validSecondLine = vertDist <= h * 0.22 && cl.w >= mainCluster.w * 0.42 && cl.count >= mainCluster.count * 0.22 &&
                                cl.minY > effectiveTopY + h * 0.06 && cl.maxY < effectiveBottomY - h * 0.05 &&
                                cl.minX > effectiveLeftX + w * 0.06 && cl.maxX < effectiveRightX - w * 0.06;
        if (sameLineWord || validSecondLine) {
          finalComps.push(...cl.comps);
        }
      }
      keptComponents = finalComps;
    }
  }

  // Fallback: if all components were filtered out by rules, keep the largest components so valid signatures never vanish
  if (keptComponents.length === 0 && components.length > 0) {
    const sorted = [...components].sort((a, b) => b.count - a.count);
    keptComponents.push(...sorted.slice(0, Math.min(5, sorted.length)));
  }

  // Populate keptMask using exact O(1) Union-Find root membership
  const keptRootSet = new Set(keptComponents.map(kc => kc.root));
  const keptMask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const idx = row + x;
      const l = labels[idx];
      if (l === 0) continue;
      if (keptRootSet.has(uf.find(l))) {
        keptMask[idx] = 1;
      }
    }
  }

  // Step 7: Bounding box from 0.5–99.5 percentile of ink coordinates + margin
  const inkXs = [];
  const inkYs = [];
  const inkNorms = [];
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const idx = row + x;
      if (keptMask[idx]) {
        inkXs.push(x);
        inkYs.push(y);
        inkNorms.push(norm[idx]);
      }
    }
  }

  if (inkXs.length === 0) {
    const outCanvas = createCanvas(targetW, targetH);
    const outCtx = outCanvas.getContext('2d');
    outCtx.fillStyle = bgColor;
    outCtx.fillRect(0, 0, targetW, targetH);
    if (w > 0 && h > 0 && sourceCanvas && sourceCanvas.width > 0 && sourceCanvas.height > 0) {
      const scale = Math.min(targetW / w, targetH / h);
      const dw = Math.max(1, Math.round(w * scale));
      const dh = Math.max(1, Math.round(h * scale));
      outCtx.drawImage(sourceCanvas, (targetW - dw) / 2, (targetH - dh) / 2, dw, dh);
    }
    return {
      success: false,
      warning: 'warnNoSignature',
      bbox: { x: 0, y: 0, w: Math.max(1, w), h: Math.max(1, h) },
      components: [],
      canvas: outCanvas,
      inkAspect: 1.0
    };
  }

  inkXs.sort((a, b) => a - b);
  inkYs.sort((a, b) => a - b);
  inkNorms.sort((a, b) => a - b);

  const minX = inkXs[Math.floor(inkXs.length * 0.005)];
  const maxX = inkXs[Math.floor(inkXs.length * 0.995)];
  const minY = inkYs[Math.floor(inkYs.length * 0.005)];
  const maxY = inkYs[Math.floor(inkYs.length * 0.995)];

  const boxH = Math.max(1, maxY - minY + 1);
  const margin = Math.max(4, Math.round(boxH * 0.08));

  let cropX = Math.max(0, minX - margin);
  let cropY = Math.max(0, minY - margin);
  let cropW = Math.min(w - cropX, (maxX - minX + 1) + margin * 2);
  let cropH = Math.min(h - cropY, boxH + margin * 2);

  if (useFullImage) {
    cropX = 0;
    cropY = 0;
    cropW = w;
    cropH = h;
  }

  // Aspect ratio check for extreme aspect warnings & rotation
  const inkAspect = cropH / Math.max(1, cropW);
  if (inkAspect > 3.0 || inkAspect < 0.08) {
    warnings.push('warnExtremeAspect');
  }

  // Calculate target fit scale so we can preserve stroke thickness when downscaling high-res photos
  const padW = targetW * 0.04;
  const padH = targetH * 0.04;
  const availW = targetW - padW * 2;
  const availH = targetH - padH * 2;
  const scale = Math.min(availW / Math.max(1, cropW), availH / Math.max(1, cropH));

  // Use a soft spatial ROI halo around keptMask so natural anti-aliased stroke edges are preserved without blocky binary clipping
  const roiRadius = Math.max(2, thickenPx + 2);
  const roiMask = dilateMask(keptMask, w, h, roiRadius);

  // Safety: if crop region is zero, return fallback
  if (cropW <= 0 || cropH <= 0) {
    const outCanvas = createCanvas(targetW, targetH);
    const outCtx = outCanvas.getContext('2d');
    outCtx.fillStyle = bgColor;
    outCtx.fillRect(0, 0, targetW, targetH);
    return {
      success: false,
      warning: 'warnNoSignature',
      bbox: { x: 0, y: 0, w: Math.max(1, w), h: Math.max(1, h) },
      components: [],
      canvas: outCanvas,
      inkAspect: 1.0
    };
  }

  // Step 8: Studio-grade continuous-tone anti-aliased ink composition
  // Normalize stroke darkness against the 25th percentile of actual pen ink (inkCoreNorm)
  // while preserving smooth sub-pixel anti-aliased edges and natural pen-pressure shading detail!
  const inkCoreNorm = inkNorms[Math.floor(inkNorms.length * 0.25)] ?? (threshold * 0.65);
  const solidFloorNorm = Math.min(threshold - 10, inkCoreNorm + (threshold - inkCoreNorm) * 0.32);
  const softCeilingNorm = Math.min(244, Math.max(solidFloorNorm + 14, threshold + 12));

  // Continuous grayscale stroke strengthening when downscaling or when user sets thickenPx > 0
  const autoSoftErodeWeight = (!useFullImage && scale < 0.42) ? (scale < 0.22 ? 0.55 : 0.35) : 0;

  const patchCanvas = createCanvas(Math.max(1, cropW), Math.max(1, cropH));
  const patchCtx = patchCanvas.getContext('2d');
  const patchImg = patchCtx.createImageData(Math.max(1, cropW), Math.max(1, cropH));
  const pData = patchImg.data;

  for (let py = 0; py < cropH; py++) {
    const sy = cropY + py;
    for (let px = 0; px < cropW; px++) {
      const sx = cropX + px;
      const sIdx = sy * w + sx;
      const pIdx = (py * cropW + px) * 4;

      if (!roiMask[sIdx]) {
        pData[pIdx] = 0;
        pData[pIdx + 1] = 0;
        pData[pIdx + 2] = 0;
        pData[pIdx + 3] = 0;
        continue;
      }

      // Compute continuous local norm (with optional smooth grayscale erosion for thickenPx or scale preservation)
      let effectiveNorm = norm[sIdx];
      if (thickenPx > 0) {
        let minN = effectiveNorm;
        for (let dy = -thickenPx; dy <= thickenPx; dy++) {
          const ny = sy + dy;
          if (ny < 0 || ny >= h) continue;
          const rOff = ny * w;
          for (let dx = -thickenPx; dx <= thickenPx; dx++) {
            const nx = sx + dx;
            if (nx < 0 || nx >= w) continue;
            if (norm[rOff + nx] < minN) minN = norm[rOff + nx];
          }
        }
        effectiveNorm = minN;
      } else if (autoSoftErodeWeight > 0) {
        let min4 = effectiveNorm;
        if (sx > 0 && norm[sIdx - 1] < min4) min4 = norm[sIdx - 1];
        if (sx + 1 < w && norm[sIdx + 1] < min4) min4 = norm[sIdx + 1];
        if (sy > 0 && norm[sIdx - w] < min4) min4 = norm[sIdx - w];
        if (sy + 1 < h && norm[sIdx + w] < min4) min4 = norm[sIdx + w];
        effectiveNorm = effectiveNorm * (1 - autoSoftErodeWeight) + min4 * autoSoftErodeWeight;
      }

      if (effectiveNorm >= softCeilingNorm) {
        pData[pIdx] = 0;
        pData[pIdx + 1] = 0;
        pData[pIdx + 2] = 0;
        pData[pIdx + 3] = 0;
        continue;
      }

      // Smooth cubic Hermite (smoothstep) ramp from softCeilingNorm (0.0) to solidFloorNorm (1.0)
      let alpha = 1.0;
      if (effectiveNorm > solidFloorNorm) {
        const t = Math.max(0, Math.min(1, (softCeilingNorm - effectiveNorm) / Math.max(1, softCeilingNorm - solidFloorNorm)));
        alpha = t * t * (3 - 2 * t);
      }

      if (keepInkColor) {
        // Preserve natural colored pen shading while boosting contrast slightly against indoor glare
        pData[pIdx] = Math.max(0, Math.round(src[sIdx * 4] * 0.84));
        pData[pIdx + 1] = Math.max(0, Math.round(src[sIdx * 4 + 1] * 0.84));
        pData[pIdx + 2] = Math.max(0, Math.round(src[sIdx * 4 + 2] * 0.84));
      } else {
        // Preserve subtle natural pen-pressure shading (10..32) inside the stroke core for realistic studio ink detail
        const coreRatio = Math.max(0, Math.min(1, effectiveNorm / Math.max(1, solidFloorNorm)));
        const inkTone = Math.round(10 + coreRatio * 22);
        pData[pIdx] = inkTone;
        pData[pIdx + 1] = inkTone;
        pData[pIdx + 2] = inkTone;
      }
      pData[pIdx + 3] = Math.round(alpha * 255);
    }
  }

  patchCtx.putImageData(patchImg, 0, 0);

  // Step 9: Fit inside target with ~4% padding, preserving aspect ratio. NEVER stretch!
  const destW = Math.max(1, Math.round(cropW * scale));
  const destH = Math.max(1, Math.round(cropH * scale));
  const destX = Math.round((targetW - destW) / 2);
  const destY = Math.round((targetH - destH) / 2);

  const outCanvas = createCanvas(targetW, targetH);
  const outCtx = outCanvas.getContext('2d');

  if (!transparent) {
    outCtx.fillStyle = bgColor;
    outCtx.fillRect(0, 0, targetW, targetH);
  }

  // Downscale smooth rendering
  const downscaledPatch = (cropW > destW * 1.5)
    ? stepDownDownscale(patchCanvas, destW, destH)
    : patchCanvas;

  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  if (downscaledPatch && downscaledPatch.width > 0 && downscaledPatch.height > 0 && destW > 0 && destH > 0) {
    outCtx.drawImage(downscaledPatch, destX, destY, destW, destH);
  }

  // Gentle core-only contrast curve on outCanvas that preserves smooth anti-aliased edge pixels (luma 195..254)
  if (!transparent && !keepInkColor) {
    const outImg = outCtx.getImageData(0, 0, targetW, targetH);
    const od = outImg.data;
    for (let i = 0; i < od.length; i += 4) {
      const luma = 0.299 * od[i] + 0.587 * od[i + 1] + 0.114 * od[i + 2];
      if (luma < 205) {
        // Deepen stroke core smoothly while leaving outer anti-aliased gray edge transition untouched
        const t = (205 - luma) / 205;
        const darken = Math.round(t * 28);
        const val = Math.max(10, Math.round(luma - darken));
        od[i] = val;
        od[i + 1] = val;
        od[i + 2] = val;
      }
    }
    outCtx.putImageData(outImg, 0, 0);
  }

  // Check if stroke too thin at destination (only warn if extreme downscale < 0.14)
  if (scale < 0.14) {
    warnings.push('warnThinInk');
  }

  return {
    success: true,
    warnings,
    bbox: { x: cropX, y: cropY, w: cropW, h: cropH },
    components: keptComponents,
    canvas: outCanvas,
    inkAspect
  };
}
