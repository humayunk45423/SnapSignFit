# PROJECT SPEC: SnapSignFit — Photo & Signature Auto-Formatter (100% client-side, free)

You are building a static website. Follow this spec exactly. Do not ask questions; make the decision stated here. Build, then TEST in a real browser (Playwright) and fix until every acceptance test passes.

## 1. Product
**Name:** SnapSignFit. **Tagline:** "Snap it. Sign it. Fit it." **Subtitle:** "Resize photos & signatures to the exact pixel size and file size. Made for government forms and exams, works for social media and anything else."

User uploads ANY common image. The site automatically fixes orientation/tilt, finds the face or the signature, crops/fits to the chosen preset (or a custom size), and outputs a file with EXACT dimensions and a file size guaranteed under the limit. The user does nothing technical: all the work and responsibility is the app's.

- **Government & Exam presets are highlighted** (first, default, with a badge) but the tool is general-purpose.
- If auto-processing is imperfect, a manual editor is always available. Never dead-end the user.

## 2. Hard constraints
- 100% free. No paid API, no AI API key, no backend, no build step. Everything runs in the browser. Zero uploads.
- CSP meta tag: `default-src 'self'; img-src 'self' blob: data:; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; connect-src 'self'`. After first load, no network requests carrying user data.
- Vanilla HTML/CSS/JS with ES modules. No frameworks.
- **All dependencies vendored into `/vendor`** (no runtime CDN), pinned versions: MediaPipe `@mediapipe/tasks-vision` (bundle + `wasm/`) with `blaze_face_short_range.tflite`; `UPNG.js` + `pako` (PNG quantization); `UTIF.js` (TIFF decode); `heic2any` (HEIC/HEIF decode, lazy-loaded only when needed). Site must work offline after load.
- **All paths RELATIVE** (`./vendor/...`) so it works on GitHub Pages sub-paths (`/repo-name/`) and Vercel.
- Bilingual UI: English + Bengali (বাংলা) toggle, all strings in `i18n.js`. Default English.
- Mobile-first, works on low-end Android Chrome. Camera button (`capture="user"`) plus normal file picker, drag-drop, and paste (Ctrl+V).
- Site name/tagline live in one `CONFIG`/`i18n.js` spot (`SITE_NAME`).

## 3. File structure
```
/index.html  /style.css
/js/app.js        UI, state, events
/js/presets.js    ALL presets (single editable data file)
/js/loader.js     decode, EXIF, HEIC/TIFF, downscale, alpha flatten
/js/orient.js     auto-rotate / tilt correction
/js/face.js       face detection + crop math
/js/signature.js  ink extraction, crop, fit
/js/smartcrop.js  generic (non-face) crop by saliency
/js/editor.js     manual editor
/js/export.js     resize, encode, size guarantee, verify
/js/i18n.js
/vendor/  /tests/  /README.md
```

## 4. Presets (`presets.js`)
Each preset: `{ id, category, label, w, h, kind: 'photo'|'signature'|'avatar'|'image', fit: 'cover'|'contain', format: 'jpg'|'png'|'webp', maxKB, locked: bool, note }`.
- `kind:'photo'` = passport/ID style face crop (§7). `'avatar'` = face-centered square profile picture. `'signature'` = ink crop, `contain` (§8). `'image'` = general image: face-aware or saliency crop (§9).
- `locked:true` (government presets) means the max size can only be LOWERED by the user, never raised.

**Category 1 — ⭐ Government & Exam (highlighted, default selected, gold badge, listed first):**
Photo 300×300, Photo 250×250, Signature 300×80, Signature 250×50, Passport 35×45 mm @300 DPI (413×531), US Passport/Visa 2×2 in (600×600). Note under them: "Sizes vary by form. Always check your form's official requirement, or use Custom." All default format JPG, `maxKB 99` (see §11), locked.

**Category 2 — Social & Web (verify sizes, platforms change; all editable in one file):**
Instagram profile 320×320, Instagram post 1080×1080, IG portrait 1080×1350, Story/Reel/TikTok 1080×1920, Facebook profile 320×320, Facebook cover 851×315, X/Twitter profile 400×400, X header 1500×500, LinkedIn profile 400×400, LinkedIn banner 1584×396, YouTube profile 800×800, YouTube banner 2560×1440, YouTube thumbnail 1280×720, WhatsApp/Telegram DP 512×512, Discord/GitHub avatar 512×512, Pinterest pin 1000×1500, Open Graph/link preview 1200×630, Favicon 512×512 and 32×32, Email/Web banner 1200×400.
Default `maxKB`: 100 (adjustable, see §11).

**Category 3 — Custom:** width, height (1–8000 px), unit selector (px / cm / mm / inch, with DPI field default 300, converted to px and rounded), lock-aspect toggle, kind (Photo / Signature / General), fit mode, format, max size, background color. "Save as my preset" (localStorage in try/catch; app must work if storage is unavailable). Also "Recently used" list.

UI: preset picker = category chips + search box + grid of cards showing `W×H`, kind icon, and limit. Gov category visually emphasized.

## 5. Image loading (`loader.js`) — bulletproof
1. **Input formats (all must work):** JPG/JPEG, PNG, WebP, GIF (first frame), BMP, AVIF, SVG (rasterized), TIFF/TIF (via UTIF), HEIC/HEIF (native if supported, else heic2any lazy-loaded). Detect by magic bytes, NOT by file extension or MIME (users rename files). Unknown/corrupt → friendly bilingual message, never crash.
2. Decode with `createImageBitmap(file, { imageOrientation: 'from-image' })` (applies EXIF). Fallback: `<img>` + `decode()`.
3. **Flatten transparency** onto white (or chosen background) before any analysis. Transparent PNG signatures must not turn black.
4. **Working copy:** if longest side > 2048, downscale via step-down halving for detection/analysis. Keep a full-res copy (cap 4096 longest side for mobile canvas limits) for final render so output stays sharp.
5. Reject > 40 MB or < 32×32 px with a clear message. Use `OffscreenCanvas` when available; `willReadFrequently:true` for pixel reads. Free memory (`bitmap.close()`, revoke URLs) when a new file loads.

## 6. Auto orientation & tilt fix (`orient.js`) — runs automatically, before crop
Goal: any rotated/tilted/sideways/upside-down image ends up upright with no user action. Every auto-fix is shown as a chip with **Undo**.
**Photos / avatar / general with faces:**
1. Apply EXIF (done in loader).
2. Detect face at angles in this order until found: 0°, 90°, 270°, 180°, then ±15°, ±30°, ±45°, ±60° (rotate the working image, detect, map back). On success, keep the rotation that yields the face upright (choose the angle with highest detection score; prefer the smallest rotation on ties).
3. Fine-level: use eye keypoints; rotate by `−tilt` if tilt between 2° and 45° so eyes are horizontal. (Rotating about the face center, edge-replicate fill.)
4. Selfie mirror: do NOT flip automatically; provide a Flip button.
5. **Auto-enhance (toggle, default ON, mild, photo/avatar/image only):** if luma histogram range is narrow or face mean luma < 60 or > 200, apply levels stretch (clip 0.5% each end) and gamma to bring face mean luma toward ~120. Never blow out highlights. Not applied to signatures.
**Signatures / documents:**
1. Ink-bbox orientation test: if the ink aspect (h/w) > 1.6 after extraction, try rotating 90° each way; keep the orientation whose ink is wider; show "rotated" chip with Undo.
2. **Straighten (paper tilt only):** natural signature slant must NOT be "corrected". Auto-rotate only with hard evidence: (a) a long straight underline/ruled line (Hough-lite on long horizontal-ish components), or (b) page/scan edges (long straight dark/light boundary lines), or (c) printed text lines in the frame. Use the detected line angle, apply if between 1° and 15°. Without evidence, apply nothing.
3. Always offer "Straighten" slider (−20°…+20°, live preview) in the editor.
4. Perspective/curled paper: not auto-corrected; use the manual crop.

## 7. Photo / passport style (`face.js`, `kind:'photo'`)
### Detection
- MediaPipe FaceDetector (`runningMode:'IMAGE'`, `minDetectionConfidence:0.3`), vendored, lazy init once, "loading model" state; GPU delegate with automatic CPU fallback.
- Retry ladder (stop at first success): (1) working copy; (2) add 25% edge-replicated padding, detect, map back; (3) the rotation ladder from §6; (4) upscale ×1.5 if image < 600 px, or downscale ×0.5 for huge faces; (5) fail → manual editor pre-centered with message "Face not detected — adjust the frame". Export still allowed.
- Multiple faces: choose largest (tie: closest to center), warn "Multiple faces detected, using the largest".
### Crop math (constants in `CONFIG` at top of file)
- Expand box: `fh' = fh*1.25`, center shifted up `0.08*fh`. Crop side `S = fh' * 1.9` (head ≈ 52% of frame height). Crop center x = face center x; y = face center y + `0.12*S`.
- If the square exceeds bounds: shift inside; if `S` > image side, shrink `S`; if still outside (face at edge), pad with edge-replicated color (not black).
- For non-square photo presets (e.g. 413×531), use the same face anchoring with the preset's aspect ratio (height `S`, width `S*w/h`).
- Result always exactly target size after resize (§11).
### Quality warnings (chips, never block): face too small (< 25% of source height), blur (Laplacian variance), too dark/bright, not facing straight, glasses glare skipped.

## 8. Signature (`signature.js`, `kind:'signature'`) — NO AI, pure image processing
Must work for: pen on paper (phone photo, uneven light, shadows), scans, blue/black/red ink, transparent PNGs, screenshots, light ink on dark background, faint/thin strokes.
1. Grayscale (luma). For colored ink also compute a `min(R,G,B)` darkness channel; use whichever has higher contrast.
2. **Illumination correction:** estimate background with large-radius blur (~5% of longest side, separable box blur on a downscaled copy), `norm = clamp(gray/bg*255)`.
3. Polarity: if median(`norm`) < 110 → invert.
4. Threshold: Otsu on `norm`. Sanity: if ink fraction > 35% or < 0.05%, retry with "darkest 3%" percentile; if still bad → "no signature found" → manual editor.
5. Ignore a 2% margin on all edges.
6. Denoise: connected components (iterative, no recursion). Drop tiny specks (< 0.02% of area) unless close to a large component (keeps i-dots/periods). Drop long straight border/ruled components spanning > 60% width.
7. Bounding box from the 0.5–99.5 percentile of ink pixel coordinates + margin (6% of box height, min 2 px at output scale).
8. Compose smoothly: alpha from `norm` (`alpha = 1 − norm/255`, contrast-stretched, gamma ~0.8, zero outside the ink mask). Ink drawn near-black (`#111`), toggle "Keep ink color" (default OFF), on pure white (or transparent if the preset/format allows, §10).
9. **Fit** inside the target with ~4% padding, aspect preserved, centered. NEVER stretch. Step-down downscale then final `drawImage` with `imageSmoothingQuality='high'`.
10. Warnings: extreme aspect ratio (tiny result), ink too thin at output size → "Thicken strokes" slider (0–2 px dilation at output size).
11. Toggle "Auto-detect / Use full image".

## 9. General images & avatars (`smartcrop.js`, `kind:'image'|'avatar'`)
- Face(s) found (ladder steps 1–3): crop window with the preset's aspect ratio containing the union of faces with headroom; `avatar` = face height ≈ 50% of crop, centered like §7; `image` = faces at rule-of-thirds (or centered for wide banners), never cutting through a face.
- No face: **saliency crop.** Sobel gradient energy + local color contrast on a ≤ 256 px copy, slide a window of the target aspect ratio (multi-scale from largest down to 70%), maximize energy sum with a mild center-bias; deterministic.
- **Fit modes (user switchable, per preset default):** **Cover** (smart crop), **Contain** (whole image, padded with chosen color or a blurred copy of the image as background), **Stretch** (shows warning, exists for forms that want it).
- Exact output dimensions always, no matter the source aspect.

## 10. Manual editor (`editor.js`) — the guarantee
- Frame locked to the preset aspect ratio. Drag to move, pinch/wheel/handles to zoom, rotate ±90°, **Straighten slider**, flip H/V, reset, "re-run auto".
- Pointer Events (mouse/touch/pen), `touch-action:none` while dragging. Live 1:1 preview of the final output next to it.
- Frame can leave the image only when "allow padding" is on (fills with background color).
- Background color option (default white); transparent option ONLY for non-government presets with PNG/WebP output.

## 11. Export & the size guarantee (`export.js`) — THE MOST IMPORTANT PART
**Formats (output):** JPG, PNG, WebP (user picks; preset supplies the default; gov presets default JPG). Filenames: `snapsignfit_photo_300x300.jpg` etc.

**Rules (non-negotiable):**
- Dimensions are EXACT, always.
- Every file must be strictly under its size limit, always. `maxBytes` defaults to **99,000 bytes** (safely below "100 KB" whether counted as 100,000 or 102,400). **Government presets are locked: the limit can be lowered but never raised above 99,000.** For non-government presets, a "Max size" dropdown appears: 50 KB, 100 KB (default), 200 KB, 500 KB, 1 MB, 2 MB, No limit, plus custom KB. Optional "Min KB" (default OFF); when set, satisfy it only while staying under max.
- Render from the FULL-RES source → step-down downscale → exact size, `imageSmoothingQuality='high'`. Output background white unless transparency is allowed.

**Size guarantee ladder** (always keep the HIGHEST quality that fits; stop at first success):
- **JPG / WebP:** (1) binary-search `toBlob` quality 1.0→0.30 (≥10 iterations); (2) continue down to 0.05; (3) apply 0.5–1 px Gaussian denoise at target size and repeat 1–2; (4) convert to grayscale (notice shown) and repeat; (5) for non-locked presets offer "Raise limit to X KB" button; otherwise disable download with a clear error. NEVER allow a download over the limit.
- **PNG (lossless can't be tuned by quality):** (1) encode with UPNG at full colors; (2) if over, quantize palette 256 → 128 → 64 → 32 → 16 → 8 colors (signatures usually fit at 16–64); (3) if still over, **auto-switch to JPG (or WebP) with a visible notice** "PNG too large; saved as JPG to fit the limit", then run the JPG ladder.
- Keep sRGB. Strip metadata (canvas encoding drops EXIF: privacy bonus, mention in UI).

**Self-verify before enabling Download:** decode the produced Blob with `createImageBitmap`; assert `width===targetW && height===targetH` AND `blob.size <= maxBytes` (gov: `< 100000`). If it fails, retry the ladder once; if still failing, show an error and keep Download disabled.
- Show live: "300×300 px · 34.2 KB ✓ under limit" (green/red).
- Download via `URL.createObjectURL` + `<a download>` (revoke after). Also "Copy to clipboard" where supported (PNG).

## 12. UI / UX
- Single page: header (logo, EN/বাং toggle), upload zone + camera, preset picker (§4), Before (with detected face/ink box overlay) / After (exact-size preview at 1× real pixels and 2×), chips (warnings + auto-fix chips with Undo), size readout, buttons [Adjust manually] [Download]. Dark/light via `prefers-color-scheme`.
- Switching preset/size/format re-runs the pipeline from the in-memory source, no re-upload.
- Heavy pixel work in a Web Worker (or chunked with `requestAnimationFrame`); spinners; UI never freezes.
- Accessible: labels, focus states, `aria-live` status, keyboard operable, contrast ≥ 4.5:1. No `alert()`.
- Footer (both languages): "Your images never leave your device. Independent free tool, not affiliated with or endorsed by any government or agency. Always check your form's official requirements."

## 13. Robustness rules
- Global `error`/`unhandledrejection` handlers show a friendly banner + "Try manual mode". No uncaught errors.
- Guard canvas limits (iOS ~16.7 MP). Cap working canvases.
- Model failing to load (blocked WASM, old browser) → auto-switch to manual/saliency mode with a message; signature mode unaffected.
- localStorage optional and wrapped in try/catch.

## 14. Testing (MANDATORY — run and fix until green)
Playwright (Chromium + mobile emulation). Serve with `npx serve` (never `file://`). Generate fixtures programmatically (canvas/PIL for signatures, format conversions, rotations); use a few public-domain/CC0 portraits for faces. Assert on the ACTUAL downloaded file (`fs.statSync`, decode, dimensions).
1. **Every input format** loads and produces a valid output: JPG, PNG, WebP, GIF, BMP, AVIF, SVG, TIFF, HEIC, plus a JPG renamed `.png` and vice versa.
2. **Every output format** (JPG, PNG, WebP) meets exact dimensions AND size limit for gov and social presets, including a noisy/grainy high-detail image and a 4000×6000 photo, and PNG that needs the JPG fallback.
3. **Photo 300×300 & 250×250:** centered face, face at each edge, tiny face in big image, huge close-up, EXIF orientation 3/6/8, sideways with no EXIF, upside-down, tilted ±10°, ±25°, ±40°, grayscale, low-light, transparent PNG, 200×200 source.
4. No face → manual editor opens, export still exact size + under limit. Two faces → largest + warning.
5. **Signature 300×80 & 250×50:** black-on-white, blue, phone photo with shadow gradient, transparent PNG, white-on-black, faint/thin, with underline, page border, very wide, very tall (auto-rotated 90° chip), tilted paper with underline (±8°, auto-straightened), natural slanted signature (must NOT be altered), tiny image, blank page (→ "no signature" + editor). Assert no stretching (ink aspect within 2%).
6. **Size cap:** every gov output `< 100000` bytes; user-lowered limit (30 KB) respected; gov limit cannot be raised via UI or DOM edit; non-gov dropdown limits respected; "No limit" works.
7. **Presets:** every preset in `presets.js` yields exact `w×h`. Custom size works in px, cm, mm, inch@DPI; saved custom preset persists (and app works with storage disabled).
8. **Social/general:** portrait/landscape/square sources into banner (2560×1440, 1500×500), story (1080×1920), and avatar presets: face never cut through; Cover/Contain/Stretch all exact size.
9. Zero non-same-origin requests; works offline after first load (`context.setOffline(true)`).
10. Language toggle changes all strings (no missing keys). No console errors in any test. Site works when served under a sub-path.
Write `tests/report.md` with pass/fail and screenshots of outputs.

## 15. Deployment
README: local run (`npx serve .`), GitHub Pages (Settings → Pages → Deploy from branch → `main` / root), Vercel (Import repo, Framework "Other", no build command, output dir `.`), how to add/edit presets in `presets.js`.

## 16. Definition of Done
All 10 test groups pass; output dimensions exact and file size within limit (gov: under 100 KB) in EVERY case; no uncaught errors; works offline; loads on throttled 3G in < 8 s (model and HEIC/TIFF libs lazy-loaded); README complete. Report results honestly; if something cannot be made to work, say so and rely on the manual-editor fallback rather than hiding it.
