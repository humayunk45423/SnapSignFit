const $ = id => document.getElementById(id);
const fileInput = $('fileInput');

// Upload buttons (desktop hero CTAs)
$('heroUploadPhoto')?.addEventListener('click', () => { setKind('photo'); fileInput?.click(); });
$('heroUploadSig')?.addEventListener('click', () => { setKind('signature'); fileInput?.click(); });

// Segmented tabs
$('heroTabPhoto')?.addEventListener('click', () => setKind('photo'));
$('heroTabSig')?.addEventListener('click', () => setKind('signature'));

export function setKind(kind) {
  const photo = kind === 'photo';
  $('heroTabPhoto')?.classList.toggle('active', photo);
  $('heroTabPhoto')?.setAttribute('aria-selected', photo);
  $('heroTabSig')?.classList.toggle('active', !photo);
  $('heroTabSig')?.setAttribute('aria-selected', !photo);
  const specName = $('heroSpecName');
  const specValue = $('heroSpecValue');
  if (specName) specName.textContent = photo ? 'BCS Photo Spec' : 'Teletalk Signature Spec';
  if (specValue) specValue.textContent = photo ? '300×300 px (≤ 100 KB)' : '300×80 px (≤ 60 KB)';
  // Tell app.js which preset to preselect for the next upload:
  document.dispatchEvent(new CustomEvent('snapsignfit:preset', {
    detail: photo ? { w: 300, h: 300, maxKB: 99, kind: 'photo' } : { w: 300, h: 80, maxKB: 60, kind: 'signature' }
  }));
}

// Preset chips behave the same way
document.querySelectorAll('#presetChips .chip').forEach(c => c.addEventListener('click', () => {
  const { w, h, kb } = c.dataset;
  document.dispatchEvent(new CustomEvent('snapsignfit:preset', {
    detail: { w: +w, h: +h, maxKB: +kb, kind: +h <= 100 ? 'signature' : 'photo' }
  }));
  fileInput?.click();
}));
