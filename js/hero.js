const $ = id => document.getElementById(id);
const fileInput = $('fileInput');

// Upload buttons (desktop hero CTAs)
$('heroUploadPhoto')?.addEventListener('click', () => {
  navigator.vibrate?.(15);
  setKind('photo');
  if (fileInput) fileInput.value = '';
  fileInput?.click();
});
$('heroUploadSig')?.addEventListener('click', () => {
  navigator.vibrate?.(15);
  setKind('signature');
  if (fileInput) fileInput.value = '';
  fileInput?.click();
});

// Segmented tabs
$('heroTabPhoto')?.addEventListener('click', () => {
  navigator.vibrate?.(12);
  setKind('photo');
});
$('heroTabSig')?.addEventListener('click', () => {
  navigator.vibrate?.(12);
  setKind('signature');
});

let currentKind = 'photo';

export function setKind(kind) {
  currentKind = kind;
  const photo = kind === 'photo';
  const seg = $('heroSegTabs') || $('heroTabPhoto')?.closest('.seg');
  if (seg) {
    seg.setAttribute('data-state', photo ? 'left' : 'right');
  }
  $('heroTabPhoto')?.classList.toggle('active', photo);
  $('heroTabPhoto')?.setAttribute('aria-selected', photo);
  $('heroTabSig')?.classList.toggle('active', !photo);
  $('heroTabSig')?.setAttribute('aria-selected', !photo);
  const specName = $('heroSpecName');
  const specValue = $('heroSpecValue');
  const isBn = document.documentElement.lang === 'bn';
  if (specName) {
    specName.setAttribute('data-i18n', photo ? 'specBcsPhoto' : 'specTeletalkSig');
    specName.textContent = isBn ? (photo ? 'বিসিএস ছবির স্পেক' : 'টেলিটক স্বাক্ষরের স্পেক') : (photo ? 'BCS Photo Spec' : 'Teletalk Signature Spec');
  }
  if (specValue) {
    specValue.setAttribute('data-i18n', photo ? 'specBcsPhotoVal' : 'specTeletalkSigVal');
    specValue.textContent = isBn ? (photo ? '৩০০×৩০০ px (≤ ১০০ KB)' : '৩০০×৮০ px (≤ ৬০ KB)') : (photo ? '300×300 px (≤ 100 KB)' : '300×80 px (≤ 60 KB)');
  }
  // Tell app.js which preset to preselect for the next upload:
  document.dispatchEvent(new CustomEvent('snapsignfit:preset', {
    detail: photo
      ? { w: 300, h: 300, maxKB: 99, kind: 'photo', preset: 'gov_photo_300x300' }
      : { w: 300, h: 80, maxKB: 60, kind: 'signature', preset: 'gov_sig_300x80' }
  }));
}

window.addEventListener('snapsignfit:lang', () => {
  setKind(currentKind);
});

// Preset chips behave the same way
document.querySelectorAll('#presetChips .chip').forEach(c => c.addEventListener('click', () => {
  const { w, h, kb, preset } = c.dataset;
  navigator.vibrate?.(15);
  const kind = +h <= 100 ? 'signature' : 'photo';
  setKind(kind);
  document.dispatchEvent(new CustomEvent('snapsignfit:preset', {
    detail: {
      w: +w,
      h: +h,
      maxKB: +kb,
      kind,
      preset: preset || undefined
    }
  }));
  fileInput?.click();
}));
