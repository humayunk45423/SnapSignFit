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
    fileWarningDesc: 'Modern browsers block JavaScript ES Modules on local files. To test locally, run npm start in the project folder or open via localhost.',
    
    // Header & Nav
    langSwitch: 'বাংলা',
    themeToggle: 'Toggle theme',
    dark: 'Dark',
    light: 'Light',
    navGovPresets: 'Govt Presets',
    navHowItWorks: 'How It Works',
    navOffline: '100% Offline',

    // How it works
    howItWorks: 'How it works',
    howStep1Title: 'Exact Pixel Dimensions',
    howStep1Desc: 'Strictly resizes to 300×300 px for portraits, 300×80 px (≤ 60 KB) & 250×50 px (≤ 50 KB) for signatures. Zero stretch or distortion.',
    howStep2Title: 'Automatic File Size Lock',
    howStep2Desc: 'Calculates exact JPEG compression so photo is under 100 KB, 300×80 signature is under 60 KB, and 250×50 signature is under 50 KB every time.',
    howStep3Title: 'Zero Server Storage',
    howStep3Desc: 'Processing happens locally in HTML5 Canvas. Your signature and face never leave your device.',

    // Preset popup modal
    choosePresetModalTitle: 'Choose a Preset',
    choosePresetModalSubtitle: 'Select a size, then pick your photo or signature from your device.',
    presetPopupHint: 'Click a preset → your file picker will open → image is processed automatically.',
    govOfficialBadge: 'Gov Official',
    duetOfficialBadge: 'DUET Official',
    
    // Upload zone & Hero
    heroBadge: 'MADE FOR BCS, TELETALK & EXAM FORMS',
    heroTitle: 'Resize your photo & signature to Bangladesh Government form presets.',
    heroSub: 'Photo 300×300 (under 100KB) · Photo 250×250 (under 100KB) · Signature 300×80 (under 60KB) · Signature 250×50 (under 50KB)',
    heroPrivacy: '100% private · runs in your browser · works offline',
    heroBtnUploadPhoto: 'Upload Photo',
    heroBtnUploadSig: 'Upload Signature',
    heroBtnViewPresets: 'All Presets',
    heroBtnAllPresets: 'All Presets',
    heroBtnDuetPresets: 'DUET Presets',
    chipBcsPhoto: 'BCS 300×300',
    chipTeletalkSig: 'Teletalk Sign 300×80',
    chipDuetPhoto: 'DUET 250×250',
    chipDuetSig: 'DUET 250×50',
    chipPassport: 'E-Passport 45×55mm',
    chipIgProfile: 'Instagram Profile',
    chipLinkedInProfile: 'LinkedIn Profile',
    dropAnywhereTitle: 'Drop image anywhere to format',
    dropAnywhereSub: 'Release to instantly auto-detect and crop · 100% offline & client-side',
    holdCompare: 'Hold to Compare',
    holdCompareText: 'Hold to Compare',
    holdCompareShort: 'Compare',
    holdCompareTitle: 'Press & hold to compare with raw original image (Shortcut: C)',
    zoomRealTitle: 'Toggle 1x Real Pixels / 2x Zoom',
    zoomRealShort: '1× Real',
    zoom2xShort: '2× Zoom',
    comparingBadge: 'ORIGINAL RAW',
    tabPhoto300: 'Photo (300×300)',
    tabSig300: 'Signature (300×80)',
    specBcsPhoto: 'BCS Photo Spec',
    specTeletalkSig: 'Teletalk Signature Spec',
    specBcsPhotoVal: '300×300 px (≤ 100 KB)',
    specTeletalkSigVal: '300×80 px (≤ 60 KB)',
    dropzoneTitle: 'Drop your photo or signature here',
    dropzoneSubtitle: 'or click to browse from device, paste (Ctrl+V), or take a photo',
    chooseFile: 'Choose File',
    takePhoto: 'Take Photo',
    dropzoneHint: 'Supports JPG, PNG, WebP, GIF, BMP, AVIF, SVG, TIFF, HEIC (up to 40 MB)',
    
    // Categories
    catGov: 'Government & Exam',
    catDuet: 'DUET Admission',
    catSocial: 'Social & Web',
    catCustom: 'Custom Size',
    searchPresets: 'Search presets (e.g. 300x300, passport, duet, facebook)...',
    govNote: 'Sizes vary by form. Always check your form\'s official requirement, or use Custom.',
    
    // Preset cards
    kindPhoto: 'Photo',
    kindSignature: 'Signature',
    kindAvatar: 'Avatar',
    kindImage: 'Image',
    lockedGovBadge: 'Gov Locked',
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
    after: 'Output Preview',
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
    chipAutoPhoto: 'Face detected — switched to Photo preset',
    chipAutoSig: 'Signature detected — switched to Signature preset',
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
    rotate: 'Rotate',
    cropSize: 'Crop Scale',
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
    btnFullscreen: 'Full Screen',
    btnExitFullscreen: 'Exit',
    exitPreview: 'Exit Preview',
    livePreview: 'Preview',
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
    
    presetSaved: 'Custom preset saved successfully!',
    copyFailed: 'Could not copy to clipboard in this browser.',
    genericError: 'An unexpected issue occurred. Try manual editing mode.',
    downloadStarted: 'Download started!',
    
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
    fileWarningDesc: 'আধুনিক ব্রাউজার লোকাল file:/// ফাইলে জাভাস্ক্রিপ্ট মডিউল ব্লক করে। সব ফিচার চালু করতে প্রোজেক্ট ফোল্ডারে npm start চালু করুন অথবা localhost ব্যবহার করুন।',

    // Header & Nav
    langSwitch: 'English',
    themeToggle: 'থিম',
    dark: 'ডার্ক',
    light: 'লাইট',
    navGovPresets: 'সরকারি প্রিসেট',
    navHowItWorks: 'কীভাবে কাজ করে',
    navOffline: '১০০% অফলাইন',

    // How it works
    howItWorks: 'কীভাবে কাজ করে',
    howStep1Title: 'সঠিক পিক্সেল মাপ',
    howStep1Desc: 'ছবির জন্য ৩০০×৩০০ পিক্সেল, স্বাক্ষরের জন্য ৩০০×৮০ পিক্সেল (≤ ৬০ KB) ও ২৫০×৫০ পিক্সেল (≤ ৫০ KB)। কোনো বিকৃতি বা টানাটানি ছাড়াই নিখুঁত মাপ।',
    howStep2Title: 'স্বয়ংক্রিয় ফাইল সাইজ নিয়ন্ত্রণ',
    howStep2Desc: 'নিখুঁত জেপিইজি কম্প্রেশন—ছবি ১০০ KB-এর নিচে, ৩০০×৮০ স্বাক্ষর ৬০ KB-এর নিচে এবং ২৫০×৫০ স্বাক্ষর ৫০ KB-এর নিচে নিশ্চিত করে।',
    howStep3Title: 'কোনো সার্ভার স্টোরেজ নেই',
    howStep3Desc: 'সমস্ত প্রসেসিং সরাসরি আপনার ব্রাউজারের HTML5 ক্যানভাসে হয়। আপনার ছবি ও স্বাক্ষর কখনোই আপনার ডিভাইস ত্যাগ করে না।',

    // Preset popup modal
    choosePresetModalTitle: 'একটি প্রিসেট বেছে নিন',
    choosePresetModalSubtitle: 'যেকোনো মাপ নির্বাচন করুন, তারপর আপনার ডিভাইস থেকে ছবি বা স্বাক্ষর আপলোড করুন।',
    presetPopupHint: 'প্রিসেটে ক্লিক করুন → ফাইল সিলেক্ট করুন → স্বয়ংক্রিয়ভাবে প্রসেস হয়ে যাবে।',
    govOfficialBadge: 'অফিসিয়াল স্পেক',
    duetOfficialBadge: 'ডুয়েট অফিসিয়াল',
    
    // Upload zone & Hero
    heroBadge: 'বিসিএস, টেলিটক ও পরীক্ষার ফর্ম',
    heroTitle: 'সরকারি ফর্মের সাইজে ছবি ও স্বাক্ষর কনভার্ট করুন',
    heroSub: 'ছবি ৩০০×৩০০ (≤১০০KB) · ছবি ২৫০×২৫০ (≤১০০KB) · স্বাক্ষর ৩০০×৮০ (≤৬০KB) · স্বাক্ষর ২৫০×৫০ (≤৫০KB)',
    heroPrivacy: '১০০% নিরাপদ · ব্রাউজারে প্রসেস · অফলাইন',
    heroBtnUploadPhoto: 'ছবি আপলোড',
    heroBtnUploadSig: 'স্বাক্ষর আপলোড',
    heroBtnViewPresets: 'সকল প্রিসেট',
    heroBtnAllPresets: 'সকল প্রিসেট',
    heroBtnDuetPresets: 'ডুয়েট প্রিসেট',
    chipBcsPhoto: 'বিসিএস ৩০০×৩০০',
    chipTeletalkSig: 'টেলিটক স্বাক্ষর ৩০০×৮০',
    chipDuetPhoto: 'ডুয়েট ২৫০×২৫০',
    chipDuetSig: 'ডুয়েট ২৫০×৫০',
    chipPassport: 'ই-পাসপোর্ট ৪৫×৫৫ মিমি',
    chipIgProfile: 'ইন্সটাগ্রাম প্রোফাইল',
    chipLinkedInProfile: 'লিঙ্কডইন প্রোফাইল',
    dropAnywhereTitle: 'যেকোনো জায়গায় ছবি ছেড়ে দিন',
    dropAnywhereSub: 'ছেড়ে দিলে সাথে সাথে স্বয়ংক্রিয়ভাবে ক্রপ ও ফরম্যাট হবে · সম্পূর্ণ অফলাইন',
    holdCompare: 'তুলনা করতে চেপে ধরুন',
    holdCompareText: 'তুলনা করতে চেপে ধরুন',
    holdCompareShort: 'তুলনা',
    holdCompareTitle: 'মূল ছবির সাথে তুলনা করতে চেপে ধরে রাখুন (শর্টকাট: C)',
    zoomRealTitle: '১× আসল পিক্সেল / ২× জুম টগল করুন',
    zoomRealShort: '১× আসল',
    zoom2xShort: '২× জুম',
    comparingBadge: 'মূল ছবি (আনপ্রসেসড)',
    tabPhoto300: 'ছবি (৩০০×৩০০)',
    tabSig300: 'স্বাক্ষর (৩০০×৮০)',
    specBcsPhoto: 'বিসিএস ছবির স্পেক',
    specTeletalkSig: 'টেলিটক স্বাক্ষরের স্পেক',
    specBcsPhotoVal: '৩০০×৩০০ px (≤ ১০০ KB)',
    specTeletalkSigVal: '৩০০×৮০ px (≤ ৬০ KB)',
    dropzoneTitle: 'ছবি বা স্বাক্ষর এখানে ড্রপ করুন',
    dropzoneSubtitle: 'বা ফাইল নির্বাচন / ক্যামেরা দিয়ে তুলুন',
    chooseFile: 'ফাইল নির্বাচন',
    takePhoto: 'ক্যামেরা',
    dropzoneHint: 'JPG, PNG, WebP, GIF, BMP, HEIC (সর্বোচ্চ ৪০ MB)',
    
    // Categories
    catGov: 'সরকারি ও পরীক্ষা',
    catDuet: 'ডুয়েট ভর্তি পরীক্ষা',
    catSocial: 'সোশ্যাল ও ওয়েব',
    catCustom: 'কাস্টম সাইজ',
    searchPresets: 'প্রিসেট খুঁজুন...',
    govNote: 'ফর্মের নিয়ম দেখে নিন বা কাস্টম ব্যবহার করুন।',
    
    // Preset cards
    kindPhoto: 'ছবি',
    kindSignature: 'স্বাক্ষর',
    kindAvatar: 'অবতার',
    kindImage: 'ছবি',
    lockedGovBadge: 'সরকারি লকড',
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
    chipAutoPhoto: 'মুখ শনাক্ত — ছবি প্রিসেটে পরিবর্তিত',
    chipAutoSig: 'স্বাক্ষর শনাক্ত — স্বাক্ষর প্রিসেটে পরিবর্তিত',
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
    rotate: 'ঘোরান',
    cropSize: 'ফ্রেম সাইজ',
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
    btnFullscreen: 'ফুলস্ক্রিন',
    btnExitFullscreen: 'বের হন',
    exitPreview: 'প্রিভিউ বন্ধ',
    livePreview: 'প্রিভিউ',
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
    
    presetSaved: 'কাস্টম প্রিসেট সফলভাবে সেভ করা হয়েছে!',
    copyFailed: 'এই ব্রাউজারে ক্লিপবোর্ডে কপি করা যায়নি।',
    genericError: 'একটি সমস্যা হয়েছে। ম্যানুয়াল এডিট ব্যবহার করে দেখুন।',
    downloadStarted: 'ডাউনলোড শুরু হয়েছে!',
    
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

let currentLang = (() => {
  try {
    const saved = localStorage.getItem('snapsignfit_lang');
    if (saved && translations[saved]) return saved;
    if (typeof document !== 'undefined' && document.documentElement?.lang === 'bn') return 'bn';
  } catch (e) {}
  return 'en';
})();

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
    window.dispatchEvent(new CustomEvent('snapsignfit:lang', { detail: { lang } }));
  }
}

export function initLanguage() {
  try {
    const saved = localStorage.getItem('snapsignfit_lang');
    if (saved && translations[saved]) {
      currentLang = saved;
    } else if (typeof document !== 'undefined' && document.documentElement?.lang === 'bn') {
      currentLang = 'bn';
    }
  } catch (e) {}
  updateDOMTranslations();
  window.dispatchEvent(new CustomEvent('snapsignfit:lang', { detail: { lang: currentLang } }));
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
  document.documentElement.setAttribute('data-lang', currentLang);
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translated = t(key);
    // If element contains an <i> or <svg> icon, preserve all icons and update text node
    const icons = Array.from(el.querySelectorAll(':scope > i, :scope > svg, :scope > [class*="fa-"]'));
    if (icons.length > 0) {
      // Find or create a text span or text node
      let textSpan = el.querySelector('.btn-text, span[data-i18n]');
      if (textSpan && textSpan !== el) {
        textSpan.textContent = translated;
      } else {
        // Keep icons, clear other child text/nodes, append translated text
        Array.from(el.childNodes).forEach(node => {
          if (!icons.includes(node) && !icons.some(ic => ic.contains(node))) {
            el.removeChild(node);
          }
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

// Attribution-free Lucide SVG Icons (ISC License)
export const ICONS = {
  'upload': `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>`,
  'camera': `<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>`,
  'clipboard-paste': `<path d="M15 2H9a1 1 0 0 0-1 1v2c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V3a1 1 0 0 0-1-1Z"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2M16 4h2a2 2 0 0 1 2 2v2M11 14h10"/><polyline points="15 10 11 14 15 18"/>`,
  'crop': `<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>`,
  'rotate-ccw': `<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>`,
  'rotate-cw': `<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.99 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>`,
  'flip-horizontal': `<path d="m8 3 4 8 5-5 5 15H2L8 3z"/><path d="M12 3v18"/>`,
  'flip-vertical': `<path d="m7 3 5 5 5-5H7z"/><path d="m7 21 5-5 5 5H7z"/><path d="M20 12h2"/><path d="M14 12h2"/><path d="M8 12h2"/><path d="M2 12h2"/>`,
  'ruler': `<path d="m21.3 15.3-7.6-7.6c-.6-.6-1.5-.6-2.1 0l-9.3 9.3c-.6.6-.6 1.5 0 2.1l7.6 7.6c.6.6 1.5.6 2.1 0l9.3-9.3c.6-.6.6-1.5 0-2.1z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>`,
  'zoom-in': `<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/>`,
  'zoom-out': `<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/>`,
  'maximize': `<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>`,
  'undo-2': `<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>`,
  'redo-2': `<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13"/>`,
  'refresh-ccw': `<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>`,
  'download': `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>`,
  'copy': `<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>`,
  'eraser': `<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>`,
  'user-round': `<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>`,
  'signature': `<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/><path d="m15 5 3 3"/>`,
  'pen-line': `<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/><path d="m15 5 3 3"/>`,
  'lock': `<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`,
  'circle-check': `<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>`,
  'circle-alert': `<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>`,
  'triangle-alert': `<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>`,
  'circle-info': `<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/>`,
  'info': `<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/>`,
  'x': `<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`,
  'languages': `<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>`,
  'sun': `<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>`,
  'moon': `<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>`,
  'shield-check': `<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>`,
  'sliders-horizontal': `<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>`,
  'cloud-upload': `<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/>`,
  'brush': `<path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>`,
  'sparkles': `<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>`,
  'hand': `<path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>`
};

export function icon(name, { size = 16, strokeWidth = 1.5, className = '' } = {}) {
  const body = ICONS[name] || ICONS['circle-info'];
  const cls = `lucide-icon lucide-${name} ${className}`.trim();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true">${body}</svg>`;
}

