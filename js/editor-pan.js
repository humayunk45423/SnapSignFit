// js/editor-pan.js: Space/middle-mouse/hand-tool pan for the Manual Crop modal only.
// Uses the CSS `translate` property, which does NOT collide with any existing `transform: scale()` zoom.
const SEL_CANVAS    = '.editor-interactive-canvas';
const SEL_CONTAINER = '.editor-viewport-container';
const SEL_MODAL     = '.editor-modal-overlay';

let space = false, handTool = false, panning = false;
let ox = 0, oy = 0, sx = 0, sy = 0, bx = 0, by = 0;

const canvas    = () => document.querySelector(SEL_CANVAS);
const container = () => document.querySelector(SEL_CONTAINER);
const modalOpen = () => {
  const m = document.querySelector(SEL_MODAL);
  // NOTE: offsetParent is always null for position:fixed elements, so we
  // check computed display instead to reliably detect visibility.
  return !!m && !m.classList.contains('hidden') && getComputedStyle(m).display !== 'none';
};
const isTyping = t => /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName) && t.type !== 'range' && t.type !== 'checkbox';
const active = () => space || handTool;

function apply() {
  const c = canvas(); if (!c) return;
  c.style.translate = `${ox}px ${oy}px`;
}
function clamp() {                       // keep at least 60px of the canvas visible
  const c = canvas(), box = container(); if (!c || !box) return;
  const cr = c.getBoundingClientRect(), br = box.getBoundingClientRect();
  const dx = (cr.left - ox) , dy = (cr.top - oy);           // un-translated origin
  const minX = br.left + 60 - (dx + cr.width),  maxX = br.right  - 60 - dx;
  const minY = br.top  + 60 - (dy + cr.height), maxY = br.bottom - 60 - dy;
  ox = Math.min(Math.max(ox, minX), maxX);
  oy = Math.min(Math.max(oy, minY), maxY);
}
export function resetEditorPan() { ox = oy = 0; apply(); }
export function setHandTool(on) {       // call from a "Hand" button on touch devices
  handTool = !!on; paintCursor();
}
window.__editorPan = {
  reset: resetEditorPan,
  setHandTool,
  isActive:  () => space || handTool,
  isPanning: () => panning
};

function paintCursor() {
  const c = canvas(); if (!c) return;
  c.classList.toggle('is-space-held', active() && !panning);
  c.classList.toggle('is-panning', panning);
}

/* ---- Space & Alt keys ---- */
window.addEventListener('keydown', e => {
  if (!modalOpen()) return;
  if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') {
    e.preventDefault(); // Stop Windows/Chromium from focusing browser menu bar
    return;
  }
  if ((e.code === 'Space' || e.key === ' ' || e.keyCode === 32) && !isTyping(e.target)) {
    e.preventDefault();                                   // no page scroll, no browser menu trigger
    e.stopImmediatePropagation();
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
    if (!space) { space = true; paintCursor(); }
  }
}, { capture: true });

window.addEventListener('keyup', e => {
  if (!modalOpen()) return;
  if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') {
    e.preventDefault(); // Stop Windows/Chromium from opening browser menu on Alt release
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
    return;
  }
  if (e.code === 'Space' || e.key === ' ' || e.keyCode === 32) {
    space = false; panning = false; paintCursor();
  }
}, { capture: true });

window.addEventListener('blur', () => { space = false; panning = false; paintCursor(); });

/* ---- Start pan: intercept EVERY input family before brush/crop code sees it ---- */
const pt = e => (e.touches?.[0] ?? e);

for (const type of ['pointerdown', 'mousedown', 'touchstart']) {
  window.addEventListener(type, e => {
    if (!modalOpen() || !container()?.contains(e.target)) return;
    const middle = e.button === 1;
    if (!(active() || middle)) return;
    if (e.touches && e.touches.length > 1) return;       // let pinch code (if any) handle 2 fingers
    e.preventDefault();
    e.stopImmediatePropagation();                        // brush / crop handlers never run
    const p = pt(e);
    panning = true; sx = p.clientX; sy = p.clientY; bx = ox; by = oy;
    paintCursor();
  }, { capture: true, passive: false });
}

/* ---- Move ---- */
for (const type of ['pointermove', 'mousemove', 'touchmove']) {
  window.addEventListener(type, e => {
    if (!panning) return;
    e.preventDefault();
    e.stopImmediatePropagation();                        // nothing is erased/restored while panning
    const p = pt(e);
    ox = bx + (p.clientX - sx);
    oy = by + (p.clientY - sy);
    clamp(); apply();
  }, { capture: true, passive: false });
}

/* ---- End ---- */
for (const type of ['pointerup', 'pointercancel', 'mouseup', 'touchend', 'touchcancel']) {
  window.addEventListener(type, e => {
    if (!panning) return;
    e.stopImmediatePropagation();
    panning = false; paintCursor();
  }, { capture: true });
}

/* ---- Reset pan when it should reset ---- */
document.addEventListener('click', e => {
  if (e.target.closest('.editor-step-tab, #btnEditorReset, [data-editor-reset]')) resetEditorPan();
});
new MutationObserver(() => { if (!modalOpen()) resetEditorPan(); })
  .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
