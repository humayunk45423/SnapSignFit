// js/i18n.js - Bilingual internationalization (English & Bengali) and configuration

export const CONFIG = {
  SITE_NAME: 'SnapSignFit',
  TAGLINE: 'Snap it. Sign it. Fit it.',
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
    
    // Header & Nav
    langSwitch: 'বাংলা',
    themeToggle: 'Toggle theme',
    dark: 'Dark',
    light: 'Light',
    
    // Upload zone
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
    brushHint: 'Scroll = Brush Size · Shift+Scroll = Hardness · Drag to erase or restore',
    straightenTool: 'Straighten Line Tool',
    straightenHint: 'Click and drag a line along a level edge',
    brushErase: 'Eraser Brush',
    brushRestore: 'Restore Brush',
    brushSize: 'Brush Size',
    brushHardness: 'Hardness',
    btnAutoAiBg: 'Auto AI Remove',
    btnResetBg: 'Reset Background',
    bgMode: 'Background Mode',
    bgWhite: 'Solid White',
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
    privacyNotice: 'Your images never leave your device. Independent free tool, not affiliated with or endorsed by any government or agency. Always check your form\'s official requirements.',
    offlineNotice: 'Works 100% offline. Zero server uploads.'
  },
  bn: {
    siteName: CONFIG.SITE_NAME,
    tagline: 'ছবি তুলুন। স্বাক্ষর করুন। সাইজ মিলিয়ে নিন।',
    subtitle: 'ছবি ও স্বাক্ষর নির্দিষ্ট পিক্সেল এবং ফাইল সাইজে নিখুঁতভাবে রূপান্তর করুন। সরকারি চাকরির আবেদন ও পরীক্ষার জন্য বিশেষভাবে তৈরি, সোশ্যাল মিডিয়াসহ যেকোনো কাজে উপযোগী।',
    
    // Header & Nav
    langSwitch: 'English',
    themeToggle: 'থিম পরিবর্তন',
    dark: 'ডার্ক',
    light: 'লাইট',
    
    // Upload zone
    dropzoneTitle: 'এখানে আপনার ছবি বা স্বাক্ষর ড্রপ করুন',
    dropzoneSubtitle: 'অথবা ফাইল সিলেক্ট করুন, পেস্ট করুন (Ctrl+V), বা ক্যামেরা দিয়ে তুলুন',
    chooseFile: 'ফাইল বাছাই করুন',
    takePhoto: 'ক্যামেরা চালু করুন',
    dropzoneHint: 'JPG, PNG, WebP, GIF, BMP, AVIF, SVG, TIFF, HEIC ফরম্যাট সমর্থিত (সর্বোচ্চ ৪০ মেগাবাইট)',
    
    // Categories
    catGov: 'সরকারি ও চাকরি পরীক্ষা',
    catSocial: 'সোশ্যাল ও ওয়েব',
    catCustom: 'কাস্টম সাইজ',
    searchPresets: 'প্রিসেট খুঁজুন (যেমন ৩০০x৩০০, পাসপোর্ট, ফেসবুক)...',
    govNote: 'বিভিন্ন ফর্মের সাইজের ভিন্নতা থাকতে পারে। আবেদনের অফিসিয়াল নির্দেশিকা দেখে নিন অথবা কাস্টম সাইজ ব্যবহার করুন।',
    
    // Preset cards
    kindPhoto: 'ছবি',
    kindSignature: 'স্বাক্ষর',
    kindAvatar: 'অবতার',
    kindImage: 'ছবি/ব্যানার',
    lockedGovBadge: 'সরকারি লকড (<১০০ KB)',
    customPreset: 'কাস্টম প্রিসেট',
    
    // Custom controls
    width: 'প্রস্থ (Width)',
    height: 'উচ্চতা (Height)',
    unit: 'একক (Unit)',
    dpi: 'DPI',
    lockAspect: 'অনুপাত লক রাখুন',
    fitMode: 'ফিট মোড',
    cover: 'কভার (স্মার্ট ক্রপ)',
    contain: 'কন্টেইন (ব্যাকগ্রাউন্ড সহ ফিট)',
    stretch: 'টেনে মেলানো (স্ট্রেচ)',
    format: 'ফরম্যাট',
    maxSize: 'সর্বোচ্চ সাইজ',
    minSize: 'সর্বনিম্ন সাইজ (KB)',
    bgColor: 'ব্যাকগ্রাউন্ড',
    colorWhite: 'সাদা',
    colorTransparent: 'স্বচ্ছ (Transparent)',
    colorCustom: 'পছন্দের রং',
    blurredBg: 'ব্লার ব্যাকগ্রাউন্ড',
    saveCustomPreset: 'প্রিসেট সেভ করুন',
    savedPresets: 'সেভ করা প্রিসেট',
    recentPresets: 'সাম্প্রতিক ব্যবহৃত',
    
    // Main preview & actions
    before: 'মূল ছবি ও ডিটেকশন',
    after: 'আউটপুট প্রিভিউ',
    zoomReal: '১× আসল পিক্সেল',
    zoom2x: '২× জুম প্রিভিউ',
    adjustManually: 'ম্যানুয়ালি এডিট করুন',
    download: 'ডাউনলোড করুন',
    copyClipboard: 'ক্লিপবোর্ডে কপি',
    copied: 'ক্লিপবোর্ডে কপি সম্পন্ন',
    processing: 'প্রক্রিয়াকরণ হচ্ছে...',
    loadingModel: 'ফেস ডিটেকশন মডেল লোড হচ্ছে...',
    
    // Size readout
    underLimit: 'সীমার মধ্যে আছে',
    overLimit: 'সীমা অতিক্রম করেছে',
    exactDimensions: 'সঠিক পিক্সেল সাইজ নিশ্চিত',
    
    // Chips & Warnings
    undo: 'বাতিল (Undo)',
    chipRotated: 'স্বয়ংক্রিয় {deg}° ঘোরানো হয়েছে',
    chipStraightened: 'কাগজের কাত {deg}° সোজা করা হয়েছে',
    chipEnhanced: 'স্বয়ংক্রিয় উজ্জ্বলতা সমন্বয় করা হয়েছে',
    warnMultiFaces: 'একাধিক মুখ শনাক্ত হয়েছে, সবচেয়ে বড়টি নেওয়া হয়েছে',
    warnNoFace: 'মুখ শনাক্ত হয়নি — ম্যানুয়াল এডিটরে ফ্রেম ঠিক করে নিন',
    warnSmallFace: 'ছবিতে মুখটি মোট উচ্চতার ২৫% এর চেয়ে ছোট',
    warnBlur: 'ছবিটি কিছুটা অস্পষ্ট বা ঝাপসা মনে হচ্ছে',
    warnDark: 'ছবিটি অতিরিক্ত অন্ধকার বা অনুজ্জ্বল',
    warnBright: 'ছবিটি অতিরিক্ত উজ্জ্বল',
    warnPose: 'মুখ সোজা সামনের দিকে তাকিয়ে নেই',
    warnPngConvertedJpg: 'ফাইলের সাইজ সীমার মধ্যে রাখতে PNG স্বয়ংক্রিয়ভাবে JPG তে রূপান্তর করা হয়েছে',
    warnGrayscale: 'কঠোর সাইজ সীমার জন্য ছবি সাদা-কালো (Grayscale) করা হয়েছে',
    warnStretch: 'স্ট্রেচ ফিটের কারণে অনুপাত নষ্ট হতে পারে',
    warnNoSignature: 'স্পষ্ট স্বাক্ষর শনাক্ত হয়নি — ম্যানুয়ালি ক্রপ করুন',
    warnThinInk: 'আউটপুট সাইজে স্বাক্ষরের কালি অতিরিক্ত পাতলা মনে হচ্ছে',
    warnExtremeAspect: 'স্বাক্ষরের অনুপাত অস্বাভাবিকভাবে চওড়া বা খাটো',
    
    // Controls bar
    autoDetectToggle: 'স্বয়ংক্রিয় শনাক্তকরণ',
    useFullImage: 'সম্পূর্ণ ছবি ব্যবহার করুন',
    thickenStrokes: 'কালি মোটা করুন',
    keepInkColor: 'মূল কালির রং রাখুন',
    autoEnhance: 'ছবির মান উন্নত করুন',
    allowPadding: 'ছবির বাইরে প্যাডিং অনুমোদন',
    
    // Manual Editor
    editorTitle: 'ম্যানুয়াল ক্রপ ও সোজা করা',
    zoom: 'জুম',
    rotateLeft: 'বামে ৯০° ঘোরান',
    rotateRight: 'ডানে ৯০° ঘোরান',
    straighten: 'সোজা করার স্লাইডার',
    flipH: 'অনুভূমিক ফ্লিপ',
    flipV: 'উল্লম্ব ফ্লিপ',
    resetCrop: 'স্বয়ংক্রিয় ক্রপে রিসেট',
    rerunAuto: 'পুনরায় শনাক্তকরণ',
    applyChanges: 'প্রয়োগ করুন ও বন্ধ করুন',
    cancel: 'বাতিল',
    editorAngle: 'কোণ',
    editorZoom: 'ভিউ জুম',
    editorX: 'কেন্দ্র X',
    editorY: 'কেন্দ্র Y',
    editorW: 'ক্রপ প্রস্থ',
    editorH: 'ক্রপ উচ্চতা',
    undo: 'পূর্বাবস্থায় ফেরান',
    redo: 'পুনরায় করুন',
    step1Crop: '১. ক্রপ ফ্রেম',
    step2Straighten: '২. সোজা ও ঘূর্ণন',
    step3Bg: '৩. ব্যাকগ্রাউন্ড ও ব্রাশ',
    commitCrop: 'পরবর্তী: সোজা ও ঘূর্ণন →',
    commitStraighten: 'পরবর্তী: ব্যাকগ্রাউন্ড ও ব্রাশ →',
    backToCrop: '← ক্রপ ফ্রেমে ফিরে যান',
    backToStraighten: '← সোজা ও ঘূর্ণনে ফিরে যান',
    cropHint: 'ফ্রেম সরাতে ড্র্যাগ করুন · সাইজ পরিবর্তন করতে কোণা টানুন',
    straightenHintStep2: 'ক্রপ করা ছবিটি ঘোরান ও সোজা করুন',
    brushHint: 'স্ক্রোল = ব্রাশ সাইজ · Shift+স্ক্রোল = হার্ডনেস · ড্র্যাগ করে মুছুন বা ফেরান',
    straightenTool: 'সোজা করার রুলার টুল',
    straightenHint: 'সোজা প্রান্ত বরাবর একটি রেখা টানুন',
    brushErase: 'ইরেজার ব্রাশ',
    brushRestore: 'রিস্টোর ব্রাশ',
    brushSize: 'ব্রাশ সাইজ',
    brushHardness: 'হার্ডনেস',
    btnAutoAiBg: 'স্বয়ংক্রিয় এআই রিমুভ',
    btnResetBg: 'রিসেট ব্যাকগ্রাউন্ড',
    bgMode: 'ব্যাকগ্রাউন্ড মোড',
    bgWhite: 'সাদা ব্যাকগ্রাউন্ড',
    bgKeep: 'আসল রাখুন',
    bgTransparent: 'স্বচ্ছ',
    bgRemove: 'এআই দিয়ে ব্যাকগ্রাউন্ড পরিবর্তন',
    bgSkippedToast: 'ব্যাকগ্রাউন্ড পরিবর্তন বাদ দেওয়া হয়েছে: ব্যক্তির পরিধি সীমার বাইরে',
    
    // Error messages
    errTooLarge: 'ফাইলটি অনেক বড় (সর্বোচ্চ ৪০ মেগাবাইট অনুমোদিত)।',
    errTooSmall: 'ছবির রেজোলিউশন খুবই ছোট (কমপক্ষে ৩২×৩২ পিক্সেল প্রয়োজন)।',
    errCorrupt: 'ছবিটি ওপেন করা সম্ভব হয়নি। ফাইলটি নষ্ট বা অকার্যকর হতে পারে।',
    errSizeExceeded: '{size} সাইজের নিচে নামানো সম্ভব হয়নি। অনুগ্রহ করে আউটপুট সাইজ কমান বা JPG নির্বাচন করুন।',
    errGovLocked: 'সরকারি ফরম্যাটে আবেদন গ্রহণযোগ্য রাখতে সাইজ সর্বোচ্চ ৯৯ KB তে লক করা থাকে।',
    
    // Footer
    privacyNotice: 'আপনার ছবি কখনো আপনার ডিভাইস ত্যাগ করে না। সম্পূর্ণ স্বাধীন ফ্রি টুল, কোনো সরকার বা সংস্থার সাথে সম্পর্কিত বা অনুমোদিত নয়। সর্বদা আপনার ফর্মের অফিসিয়াল প্রয়োজনীয়তা যাচাই করুন।',
    offlineNotice: 'সম্পূর্ণ অফলাইনে কাজ করে। কোনো সার্ভার আপলোড নেই।'
  }
};

let currentLang = 'en';

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
  
  const langToggleBtn = document.getElementById('langToggleBtn');
  if (langToggleBtn) {
    langToggleBtn.textContent = currentLang === 'en' ? 'বাংলা' : 'English';
  }
}

