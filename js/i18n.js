// js/i18n.js - Bilingual internationalization (English & Bengali) and configuration

export const CONFIG = {
  SITE_NAME: 'SnapSignFit',
  TAGLINE: 'Snap it. Fit it.',
  SUBTITLE: 'Resize photos & signatures to the exact pixel size and file size. Made for government forms and exams, works for social media and anything else.',
  DEFAULT_MAX_BYTES_GOV: 99000,
  ABSOLUTE_GOV_LIMIT: 99999,
  DEFAULT_NON_GOV_KB: 100,
  FACE: {
    HEAD_RATIO: 1.25,
    SHIFT_UP_RATIO: 0.08,
    CROP_SIDE_RATIO: 1.9, // Head ~52% of frame height
    CENTER_Y_SHIFT_RATIO: 0.12
  }
};

export const translations = {
  en: {
    siteName: CONFIG.SITE_NAME,
    tagline: CONFIG.TAGLINE,
    subtitle: CONFIG.SUBTITLE,
    
    // File Protocol Warning
    fileWarningTitle: 'Opened directly from local file (file:///)?',
    fileWarningDesc: 'Modern browsers block JavaScript ES Modules on local files. To test locally, double-click start.bat in the project folder or open via localhost.',
    
    // Header & Nav
    langSwitch: 'বাংলা',
    themeToggle: 'Toggle theme',
    dark: 'Dark',
    light: 'Light',
    
    // Upload zone & Hero
    heroBadge: 'MADE FOR BCS, TELETALK & EXAM FORMS',
    heroTitle: 'Resize your photo & signature to Bangladesh Government form presets.',
    heroSub: 'Photo 300×300 (under 100KB) · Photo 250×250 (under 100KB) · Signature 300×80 (under 60KB) · Signature 250×50 (under 60KB)',
    heroPrivacy: '100% private · runs in your browser · works offline',
    dropzoneTitle: 'Drop your photo or signature here',
    dropzoneSubtitle: 'or click to browse from device, paste (Ctrl+V), or take a photo',
    chooseFile: 'Choose File',
    takePhoto: 'Take Photo',
    dropzoneHint: 'Supports JPG, PNG, WebP, GIF, BMP, AVIF, SVG, TIFF, HEIC (up to 40 MB)',
    
    // Categories
    catGov: 'Government & Exam',
    catSocial: 'Social & Web',
    catCustom: 'Custom Size',
    searchPresets: 'Search presets (e.g. 300x300, passport, facebook)...',
    govNote: 'Sizes vary by form. Always check your form\'s official requirement, or use Custom.',
    
    // Preset cards
    kindPhoto: 'Photo',
    kindSignature: 'Signature',
    kindAvatar: 'Avatar',
    kindImage: 'Image',
    lockedGovBadge: 'Gov Locked (<100KB)',
    customPreset: 'Custom Preset',
    
    // Custom controls
    width: 'Width',
    height: 'Height',
    unit: 'Unit',
    dpi: 'DPI',
    lockAspect: 'Lock aspect ratio',
    fitMode: 'Fit mode',
    cover: 'Cover (Smart Crop)',
    contain: 'Contain (Fit with background)',
    stretch: 'Stretch (Form compatibility)',
    format: 'Format',
    maxSize: 'Max File Size',
    minSize: 'Min File Size (KB)',
    bgColor: 'Background',
    colorWhite: 'White',
    colorTransparent: 'Transparent',
    colorCustom: 'Custom Color',
    blurredBg: 'Blurred Image BG',
    saveCustomPreset: 'Save preset',
    savedPresets: 'Saved Presets',
    recentPresets: 'Recently Used',
    
    // Main preview & actions
    before: 'Original & Detection',
    after: 'Exact Output Preview',
    zoomReal: '1× Real Pixels',
    zoom2x: '2× Zoomed',
    adjustManually: 'Adjust Manually',
    download: 'Download',
    discardBtn: 'Discard / Close',
    discardModalTitle: 'Discard Changes?',
    discardModalDesc: "You haven't downloaded your processed image yet. Do you want to download before closing?",
    btnDownloadAndClose: 'Download & Close',
    btnDiscardAnyway: 'Discard Anyway',
    copyClipboard: 'Copy to Clipboard',
    copied: 'Copied to clipboard',
    processing: 'Processing image...',
    loadingModel: 'Loading face detector model...',
    
    // Size readout
    underLimit: 'under limit',
    overLimit: 'over limit',
    exactDimensions: 'Exact dimensions guaranteed',
    
    // Chips & Warnings
    undo: 'Undo',
    chipRotated: 'Auto-rotated {deg}°',
    chipStraightened: 'Paper tilt straightened {deg}°',
    chipEnhanced: 'Auto-enhanced contrast/brightness',
    warnMultiFaces: 'Multiple faces detected, using the largest',
    warnNoFace: 'Face not detected — opening manual editor to adjust frame',
    warnSmallFace: 'Face is smaller than 25% of source height',
    warnBlur: 'Photo appears blurry or out of focus',
    warnDark: 'Photo appears underexposed (too dark)',
    warnBright: 'Photo appears overexposed (too bright)',
    warnPose: 'Head does not appear to be facing straight ahead',
    warnPngConvertedJpg: 'PNG was too large to meet size limit; auto-converted to JPG',
    warnGrayscale: 'Color converted to grayscale to meet strict size limit',
    warnStretch: 'Stretch fit may distort the image aspect ratio',
    warnNoSignature: 'No distinct signature strokes found — adjust in manual editor',
    warnThinInk: 'Ink strokes are very thin at output size',
    warnExtremeAspect: 'Signature aspect ratio is unusually wide or narrow',
    
    // Controls bar
    autoDetectToggle: 'Auto-detect crop',
    useFullImage: 'Use full image',
    thickenStrokes: 'Thicken strokes',
    keepInkColor: 'Keep original ink color',
    autoEnhance: 'Auto-enhance photo',
    allowPadding: 'Allow padding outside image',
    
    // Manual Editor
    editorTitle: 'Manual Crop & Straighten',
    zoom: 'Zoom',
    rotateLeft: 'Rotate -90°',
    rotateRight: 'Rotate +90°',
    straighten: 'Straighten Slider',
    flipH: 'Flip Horizontal',
    flipV: 'Flip Vertical',
    resetCrop: 'Reset to Auto',
    rerunAuto: 'Re-run Detection',
    applyChanges: 'Apply & Close',
    cancel: 'Cancel',
    editorAngle: 'Angle',
    editorZoom: 'Zoom View',
    editorX: 'Center X',
    editorY: 'Center Y',
    editorW: 'Crop Width',
    editorH: 'Crop Height',
    undo: 'Undo',
    redo: 'Redo',
    step1Crop: '1. Crop Frame',
    step2Straighten: '2. Straighten & Rotate',
    step3Bg: '3. Background & Brush',
    commitCrop: 'Next: Straighten & Rotate →',
    commitStraighten: 'Next: Background & Brush →',
    backToCrop: '← Back to Crop Frame',
    backToStraighten: '← Back to Straighten & Rotate',
    cropHint: 'Drag frame to move · Drag corners to resize',
    straightenHintStep2: 'Rotate and straighten the cropped image',
    brushHint: 'Scroll = Brush Size · Shift+Scroll = Hardness · Alt+Scroll = Zoom · Drag to erase or restore',
    straightenTool: 'Straighten Line Tool',
    brushErase: 'Eraser',
    brushRestore: 'Restore',
    moveTool: 'Move',
    brushSize: 'Brush Size',
    brushHardness: 'Hardness',
    btnAutoAiBg: 'Auto AI Remove',
    btnResetBg: 'Reset Background',
    bgMode: 'Background Mode',
    bgWhite: 'Solid White',
    bgBlue: 'Light Blue (Passport/Visa)',
    bgGray: 'Light Gray',
    bgRed: 'Solid Red',
    bgCustom: 'Custom Color...',
    bgKeep: 'Keep Original',
    bgTransparent: 'Transparent',
    bgRemove: 'Remove AI',
    bgSkippedToast: 'Background removal skipped: person area outside 10%-85% safety gate',
    
    // Error messages
    errTooLarge: 'File is too large (maximum 40 MB allowed).',
    errTooSmall: 'Image resolution is too small (minimum 32×32 px required).',
    errCorrupt: 'Unable to decode image file. The file may be corrupt or an unsupported format.',
    errSizeExceeded: 'Could not compress image below {size} without exceeding degradation limits. Please try lowering output dimensions or choosing JPG.',
    errGovLocked: 'Government presets are strictly locked to maximum 99 KB to ensure acceptance.',
    
    // Footer
    privacyNotice: 'Your images never leave your device.',
    offlineNotice: 'Works 100% offline · Zero server uploads',
    disclaimerNotice: 'Independent free tool',
    developerCredit: 'Developed by Humayoun'
  },
  bn: {
    siteName: CONFIG.SITE_NAME,
    tagline: 'স্ন্যাপ করুন। ফিট করুন।',
    subtitle: 'ছবি ও স্বাক্ষর নির্দিষ্ট সাইজে দ্রুত কনভার্ট করুন।',
    
    // File Protocol Warning
    fileWarningTitle: 'লোকাল ডিস্ক (file:///) থেকে ওপেন করেছেন?',
    fileWarningDesc: 'আধুনিক ব্রাউজার লোকাল file:/// ফাইলে জাভাস্ক্রিপ্ট মডিউল ব্লক করে। সব ফিচার চালু করতে প্রোজেক্ট ফোল্ডারে start.bat চালু করুন অথবা localhost ব্যবহার করুন।',

    // Header & Nav
    langSwitch: 'English',
    themeToggle: 'থিম',
    dark: 'ডার্ক',
    light: 'লাইট',
    
    // Upload zone & Hero
    heroBadge: 'বিসিএস, টেলিটক ও পরীক্ষার ফর্ম',
    heroTitle: 'সরকারি ফর্মের সাইজে ছবি ও স্বাক্ষর কনভার্ট করুন',
    heroSub: 'ছবি ৩০০×৩০০ (≤১০০KB) · ছবি ২৫০×২৫০ (≤১০০KB) · স্বাক্ষর ৩০০×৮০ (≤৬০KB) · স্বাক্ষর ২৫০×৫০ (≤৬০KB)',
    heroPrivacy: '১০০% নিরাপদ · ব্রাউজারে প্রসেস · অফলাইন',
    dropzoneTitle: 'ছবি বা স্বাক্ষর এখানে ড্রপ করুন',
    dropzoneSubtitle: 'বা ফাইল নির্বাচন / ক্যামেরা দিয়ে তুলুন',
    chooseFile: 'ফাইল নির্বাচন',
    takePhoto: 'ক্যামেরা',
    dropzoneHint: 'JPG, PNG, WebP, GIF, BMP, HEIC (সর্বোচ্চ ৪০ MB)',
    
    // Categories
    catGov: 'সরকারি ও পরীক্ষা',
    catSocial: 'সোশ্যাল ও ওয়েব',
    catCustom: 'কাস্টম সাইজ',
    searchPresets: 'প্রিসেট খুঁজুন...',
    govNote: 'ফর্মের নিয়ম দেখে নিন বা কাস্টম ব্যবহার করুন।',
    
    // Preset cards
    kindPhoto: 'ছবি',
    kindSignature: 'স্বাক্ষর',
    kindAvatar: 'অবতার',
    kindImage: 'ছবি',
    lockedGovBadge: 'সরকারি লকড (<১০০KB)',
    customPreset: 'কাস্টম',
    
    // Custom controls
    width: 'প্রস্থ',
    height: 'উচ্চতা',
    unit: 'একক',
    dpi: 'DPI',
    lockAspect: 'অনুপাত লক',
    fitMode: 'ফিট মোড',
    cover: 'কভার (স্মার্ট ক্রপ)',
    contain: 'কন্টেইন',
    stretch: 'স্ট্রেচ',
    format: 'ফরম্যাট',
    maxSize: 'সর্বোচ্চ সাইজ',
    minSize: 'সর্বনিম্ন সাইজ',
    bgColor: 'ব্যাকগ্রাউন্ড',
    colorWhite: 'সাদা',
    colorTransparent: 'স্বচ্ছ',
    colorCustom: 'কাস্টম রং',
    blurredBg: 'ব্লার ব্যাকগ্রাউন্ড',
    saveCustomPreset: 'সেভ করুন',
    savedPresets: 'সেভ করা প্রিসেট',
    recentPresets: 'সাম্প্রতিক',
    
    // Main preview & actions
    before: 'মূল ছবি',
    after: 'আউটপুট',
    zoomReal: '১× আসল',
    zoom2x: '২× জুম',
    adjustManually: 'ম্যানুয়াল এডিট',
    download: 'ডাউনলোড',
    discardBtn: 'বাতিল / বন্ধ',
    discardModalTitle: 'বাতিল করবেন?',
    discardModalDesc: 'ছবিটি ডাউনলোড করেননি। বন্ধ করার আগে ডাউনলোড করবেন?',
    btnDownloadAndClose: 'ডাউনলোড করে বন্ধ',
    btnDiscardAnyway: 'সরাসরি বাতিল',
    copyClipboard: 'কপি',
    copied: 'কপি হয়েছে',
    processing: 'প্রসেসিং হচ্ছে...',
    loadingModel: 'মডেল লোড হচ্ছে...',
    
    // Size readout
    underLimit: 'সীমার মধ্যে',
    overLimit: 'সীমাতিরিক্ত',
    exactDimensions: 'সঠিক সাইজ নিশ্চিত',
    
    // Chips & Warnings
    undo: 'পূর্বাবস্থায়',
    redo: 'পুনরায়',
    chipRotated: '{deg}° ঘোরানো হয়েছে',
    chipStraightened: '{deg}° সোজা করা হয়েছে',
    chipEnhanced: 'উজ্জ্বলতা সমন্বয়',
    warnMultiFaces: 'একাধিক মুখ শনাক্ত, বড়টি গৃহীত',
    warnNoFace: 'মুখ শনাক্ত হয়নি — ম্যানুয়াল এডিট করুন',
    warnSmallFace: 'মুখ উচ্চতার ২৫% এর চেয়ে ছোট',
    warnBlur: 'ছবিটি কিছুটা ঝাপসা',
    warnDark: 'ছবিটি অন্ধকার',
    warnBright: 'ছবিটি অতিরিক্ত উজ্জ্বল',
    warnPose: 'মুখ সোজা সামনে নেই',
    warnPngConvertedJpg: 'সাইজের কারণে JPG তে রূপান্তর',
    warnGrayscale: 'সাইজ মেলাতে সাদা-কালো করা হয়েছে',
    warnStretch: 'স্ট্রেচে অনুপাত নষ্ট হতে পারে',
    warnNoSignature: 'স্বাক্ষর মেলেনি — ক্রপ করুন',
    warnThinInk: 'স্বাক্ষরের কালি পাতলা',
    warnExtremeAspect: 'স্বাক্ষরের অনুপাত অস্বাভাবিক',
    
    // Controls bar
    autoDetectToggle: 'স্বয়ংক্রিয় ডিটেক্ট',
    useFullImage: 'সম্পূর্ণ ছবি',
    thickenStrokes: 'কালি গাঢ় করুন',
    keepInkColor: 'আসল কালির রং',
    autoEnhance: 'উন্নত মান',
    allowPadding: 'প্যাডিং',
    
    // Manual Editor
    editorTitle: 'ক্রপ ও সোজা করা',
    zoom: 'জুম',
    rotateLeft: 'বামে ৯০°',
    rotateRight: 'ডানে ৯০°',
    straighten: 'সোজা করুন',
    flipH: 'অনুভূমিক',
    flipV: 'উল্লম্ব',
    resetCrop: 'অটো রিসেট',
    rerunAuto: 'পুনরায় ডিটেক্ট',
    applyChanges: 'প্রয়োগ ও বন্ধ',
    cancel: 'বাতিল',
    editorAngle: 'কোণ',
    editorZoom: 'জুম',
    editorX: 'X',
    editorY: 'Y',
    editorW: 'প্রস্থ',
    editorH: 'উচ্চতা',
    step1Crop: '১. ক্রপ',
    step2Straighten: '২. সোজা',
    step3Bg: '৩. ব্যাকগ্রাউন্ড',
    commitCrop: 'পরবর্তী: সোজা →',
    commitStraighten: 'পরবর্তী: ব্যাকগ্রাউন্ড →',
    backToCrop: '← ক্রপ',
    backToStraighten: '← সোজা',
    cropHint: 'সরাতে ড্র্যাগ করুন · সাইজ বদলাতে কোণা টানুন',
    straightenHintStep2: 'ছবি ঘোরান ও সোজা করুন',
    brushHint: 'ড্র্যাগ করে মুছুন বা ফেরান',
    straightenTool: 'রুলার',
    straightenHint: 'প্রান্ত বরাবর রেখা টানুন',
    brushErase: 'মুছুন',
    brushRestore: 'ফেরান',
    moveTool: 'সরান',
    brushSize: 'সাইজ',
    brushHardness: 'হার্ডনেস',
    btnAutoAiBg: 'এআই রিমুভ',
    btnResetBg: 'রিসেট',
    bgMode: 'ব্যাকগ্রাউন্ড',
    bgWhite: 'সাদা',
    bgBlue: 'হালকা নীল (পাসপোর্ট/ভিসা)',
    bgGray: 'হালকা ধূসর',
    bgRed: 'লাল',
    bgCustom: 'কাস্টম রং...',
    bgKeep: 'আসল',
    bgTransparent: 'স্বচ্ছ',
    bgRemove: 'এআই ব্যাকগ্রাউন্ড',
    bgSkippedToast: 'ব্যক্তির পরিধি সীমার বাইরে',
    
    // Error messages
    errTooLarge: 'ফাইল অনেক বড় (সর্বোচ্চ ৪০ MB)।',
    errTooSmall: 'রেজোলিউশন খুবই ছোট (কমপক্ষে ৩২×৩২ px)।',
    errCorrupt: 'ছবিটি ওপেন করা যায়নি। ফাইলটি নষ্ট হতে পারে।',
    errSizeExceeded: '{size} এ নামানো যায়নি। সাইজ কমান বা JPG বাছুন।',
    errGovLocked: 'সরকারি ফরম্যাটে সাইজ সর্বোচ্চ ৯৯ KB তে লকড।',
    
    // Footer
    privacyNotice: 'ছবি ডিভাইসেই প্রসেস হয়',
    offlineNotice: '১০০% অফলাইন · নো আপলোড',
    disclaimerNotice: 'ফ্রি ওপেন টুল',
    developerCredit: 'Developed by Humayoun'
  }
};

let currentLang = 'bn';

export function getLanguage() {
  return currentLang;
}

export function setLanguage(lang) {
  if (translations[lang]) {
    currentLang = lang;
    try {
      localStorage.setItem('snapsignfit_lang', lang);
    } catch (e) {
      // localStorage may be disabled
    }
    updateDOMTranslations();
  }
}

export function initLanguage() {
  try {
    const saved = localStorage.getItem('snapsignfit_lang');
    if (saved && translations[saved]) {
      currentLang = saved;
    }
  } catch (e) {}
  updateDOMTranslations();
}

export function t(key, params = {}) {
  const dict = translations[currentLang] || translations.en;
  let text = dict[key] || translations.en[key] || key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return text;
}

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function parseLocalizedNumber(str, lang = currentLang) {
  if (typeof str === 'number') return str;
  if (!str) return NaN;
  let s = String(str).trim();
  // Map Bengali digits to ASCII digits
  s = s.replace(/[০-৯]/g, d => String(d.charCodeAt(0) - 0x09E6));
  // Replace comma with dot if it acts as decimal separator
  s = s.replace(/,/g, '.');
  return parseFloat(s);
}

export function formatLocalizedNumber(num, lang = currentLang) {
  if (num === null || num === undefined || isNaN(num)) return '';
  const s = String(num);
  if (lang === 'bn') {
    return s.replace(/[0-9]/g, d => BENGALI_DIGITS[parseInt(d, 10)]);
  }
  return s;
}

export function updateDOMTranslations() {
  document.documentElement.lang = currentLang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translated = t(key);
    // If element contains an <i> icon, preserve the icon and update text node
    const icon = el.querySelector('i');
    if (icon) {
      // Find or create a text span or text node
      let textSpan = el.querySelector('.btn-text');
      if (textSpan) {
        textSpan.textContent = translated;
      } else {
        // Keep icon, clear other child nodes, append translated text
        Array.from(el.childNodes).forEach(node => {
          if (node !== icon) el.removeChild(node);
        });
        el.appendChild(document.createTextNode(' ' + translated));
      }
    } else {
      el.textContent = translated;
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.setAttribute('placeholder', t(key));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    el.setAttribute('title', t(key));
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria');
    el.setAttribute('aria-label', t(key));
  });
  
  // Update segmented lang toggle state (BN on left, EN on right)
  const langToggle = document.getElementById('langToggleBtn');
  if (langToggle) {
    langToggle.setAttribute('data-state', currentLang === 'en' ? 'right' : 'left');
    langToggle.setAttribute('aria-label', currentLang === 'en' ? 'Switch to Bengali (বাংলা)' : 'Switch to English');
    langToggle.setAttribute('title', currentLang === 'en' ? 'Switch to Bengali (বাংলা)' : 'Switch to English');
  }
}

