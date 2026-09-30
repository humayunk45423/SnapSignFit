// js/presets.js - All preset definitions and helpers

export const PRESETS = [
  // --- Category 1: ⭐ Government & Exam (Highlighted, gold badge, locked to <= 99 KB) ---
  {
    id: 'gov_photo_300x300',
    category: 'gov',
    label: 'Photo 300×300',
    w: 300,
    h: 300,
    kind: 'photo',
    fit: 'cover',
    format: 'jpg',
    maxKB: 99,
    locked: true,
    note: 'Standard Bangladesh Government, BCS, Teletalk & SSC/HSC exam photo'
  },
  {
    id: 'gov_photo_250x250',
    category: 'gov',
    label: 'Photo 250×250',
    w: 250,
    h: 250,
    kind: 'photo',
    fit: 'cover',
    format: 'jpg',
    maxKB: 99,
    locked: true,
    note: 'Bangladesh Civil / Bank / University admission standard photo'
  },
  {
    id: 'gov_sig_300x80',
    category: 'gov',
    label: 'Signature 300×80',
    w: 300,
    h: 80,
    kind: 'signature',
    fit: 'contain',
    format: 'jpg',
    maxKB: 59,
    locked: true,
    note: 'Standard Bangladesh Government, Teletalk & Bank applicant signature'
  },
  {
    id: 'gov_sig_250x50',
    category: 'gov',
    label: 'Signature 250×50',
    w: 250,
    h: 50,
    kind: 'signature',
    fit: 'contain',
    format: 'jpg',
    maxKB: 59,
    locked: true,
    note: 'University & College admission standard signature'
  },
  {
    id: 'gov_passport_35x45',
    category: 'gov',
    label: 'Passport 35×45 mm',
    w: 413,
    h: 531,
    kind: 'photo',
    fit: 'cover',
    format: 'jpg',
    maxKB: 99,
    locked: true,
    note: 'International standard passport / visa photo (35×45 mm @ 300 DPI)'
  },
  {
    id: 'gov_us_passport_2x2',
    category: 'gov',
    label: 'US Passport / Visa 2×2 in',
    w: 600,
    h: 600,
    kind: 'photo',
    fit: 'cover',
    format: 'jpg',
    maxKB: 99,
    locked: true,
    note: 'US Passport, DS-160 & Diversity Visa photo (2×2 in @ 300 DPI)'
  },

  // --- Category 2: Social & Web ---
  {
    id: 'social_ig_profile',
    category: 'social',
    label: 'Instagram Profile',
    w: 320,
    h: 320,
    kind: 'avatar',
    fit: 'cover',
    format: 'jpg',
    maxKB: 100,
    locked: false,
    note: 'Instagram circular profile display'
  },
  {
    id: 'social_ig_post',
    category: 'social',
    label: 'Instagram Square Post',
    w: 1080,
    h: 1080,
    kind: 'image',
    fit: 'cover',
    format: 'jpg',
    maxKB: 200,
    locked: false,
    note: 'Standard 1:1 Instagram post feed'
  },
  {
    id: 'social_ig_portrait',
    category: 'social',
    label: 'Instagram Portrait',
    w: 1080,
    h: 1350,
    kind: 'image',
    fit: 'cover',
    format: 'jpg',
    maxKB: 200,
    locked: false,
    note: '4:5 ratio portrait post'
  },
  {
    id: 'social_story_reel',
    category: 'social',
    label: 'Story / Reel / TikTok',
    w: 1080,
    h: 1920,
    kind: 'image',
    fit: 'cover',
    format: 'jpg',
    maxKB: 500,
    locked: false,
    note: '9:16 vertical full-screen content'
  },
  {
    id: 'social_fb_profile',
    category: 'social',
    label: 'Facebook Profile',
    w: 320,
    h: 320,
    kind: 'avatar',
    fit: 'cover',
    format: 'jpg',
    maxKB: 100,
    locked: false,
    note: 'Facebook user profile picture'
  },
  {
    id: 'social_fb_cover',
    category: 'social',
    label: 'Facebook Cover',
    w: 851,
    h: 315,
    kind: 'image',
    fit: 'cover',
    format: 'jpg',
    maxKB: 200,
    locked: false,
    note: 'Facebook desktop & mobile timeline header'
  },
  {
    id: 'social_x_profile',
    category: 'social',
    label: 'X / Twitter Profile',
    w: 400,
    h: 400,
    kind: 'avatar',
    fit: 'cover',
    format: 'jpg',
    maxKB: 100,
    locked: false,
    note: 'X / Twitter profile avatar'
  },
  {
    id: 'social_x_header',
    category: 'social',
    label: 'X / Twitter Header',
    w: 1500,
    h: 500,
    kind: 'image',
    fit: 'cover',
    format: 'jpg',
    maxKB: 500,
    locked: false,
    note: '3:1 wide banner for X profiles'
  },
  {
    id: 'social_li_profile',
    category: 'social',
    label: 'LinkedIn Profile',
    w: 400,
    h: 400,
    kind: 'avatar',
    fit: 'cover',
    format: 'jpg',
    maxKB: 100,
    locked: false,
    note: 'LinkedIn professional headshot'
  },
  {
    id: 'social_li_banner',
    category: 'social',
    label: 'LinkedIn Banner',
    w: 1584,
    h: 396,
    kind: 'image',
    fit: 'cover',
    format: 'jpg',
    maxKB: 500,
    locked: false,
    note: 'LinkedIn profile background'
  },
  {
    id: 'social_yt_profile',
    category: 'social',
    label: 'YouTube Profile',
    w: 800,
    h: 800,
    kind: 'avatar',
    fit: 'cover',
    format: 'jpg',
    maxKB: 200,
    locked: false,
    note: 'YouTube channel icon'
  },
  {
    id: 'social_yt_banner',
    category: 'social',
    label: 'YouTube Banner',
    w: 2560,
    h: 1440,
    kind: 'image',
    fit: 'cover',
    format: 'jpg',
    maxKB: 1000,
    locked: false,
    note: '16:9 channel art desktop display'
  },
  {
    id: 'social_yt_thumb',
    category: 'social',
    label: 'YouTube Thumbnail',
    w: 1280,
    h: 720,
    kind: 'image',
    fit: 'cover',
    format: 'jpg',
    maxKB: 500,
    locked: false,
    note: '16:9 HD video preview thumbnail'
  },
  {
    id: 'social_wa_dp',
    category: 'social',
    label: 'WhatsApp / Telegram DP',
    w: 512,
    h: 512,
    kind: 'avatar',
    fit: 'cover',
    format: 'jpg',
    maxKB: 100,
    locked: false,
    note: 'Messaging display photo'
  },
  {
    id: 'social_discord_avatar',
    category: 'social',
    label: 'Discord / GitHub Avatar',
    w: 512,
    h: 512,
    kind: 'avatar',
    fit: 'cover',
    format: 'png',
    maxKB: 200,
    locked: false,
    note: 'Developer & community profile'
  },
  {
    id: 'social_pinterest_pin',
    category: 'social',
    label: 'Pinterest Pin',
    w: 1000,
    h: 1500,
    kind: 'image',
    fit: 'cover',
    format: 'jpg',
    maxKB: 500,
    locked: false,
    note: '2:3 optimal vertical pin'
  },
  {
    id: 'social_og_image',
    category: 'social',
    label: 'Open Graph / Link Preview',
    w: 1200,
    h: 630,
    kind: 'image',
    fit: 'cover',
    format: 'jpg',
    maxKB: 300,
    locked: false,
    note: 'Web metadata preview for social shares'
  },
  {
    id: 'social_favicon_512',
    category: 'social',
    label: 'Favicon 512×512',
    w: 512,
    h: 512,
    kind: 'image',
    fit: 'contain',
    format: 'png',
    maxKB: 200,
    locked: false,
    note: 'High-res web app icon (PWA)'
  },
  {
    id: 'social_favicon_32',
    category: 'social',
    label: 'Favicon 32×32',
    w: 32,
    h: 32,
    kind: 'image',
    fit: 'contain',
    format: 'png',
    maxKB: 50,
    locked: false,
    note: 'Standard browser tab icon'
  },
  {
    id: 'social_email_banner',
    category: 'social',
    label: 'Email / Web Banner',
    w: 1200,
    h: 400,
    kind: 'image',
    fit: 'cover',
    format: 'jpg',
    maxKB: 200,
    locked: false,
    note: '3:1 newsletter or website banner'
  }
];

// Local storage keys
const KEY_SAVED_PRESETS = 'snapsignfit_saved_presets';
const KEY_RECENT_PRESETS = 'snapsignfit_recent_presets';

export function getSavedCustomPresets() {
  try {
    const raw = localStorage.getItem(KEY_SAVED_PRESETS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function saveCustomPreset(preset) {
  try {
    const current = getSavedCustomPresets();
    const updated = [preset, ...current.filter(p => p.id !== preset.id)].slice(0, 20);
    localStorage.setItem(KEY_SAVED_PRESETS, JSON.stringify(updated));
    return true;
  } catch (e) {
    return false;
  }
}

export function deleteSavedCustomPreset(presetId) {
  try {
    const current = getSavedCustomPresets();
    const updated = current.filter(p => p.id !== presetId);
    localStorage.setItem(KEY_SAVED_PRESETS, JSON.stringify(updated));
    return true;
  } catch (e) {
    return false;
  }
}

export function getRecentPresets() {
  try {
    const raw = localStorage.getItem(KEY_RECENT_PRESETS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function recordRecentPreset(preset) {
  try {
    const current = getRecentPresets();
    const minified = {
      id: preset.id,
      label: preset.label,
      w: preset.w,
      h: preset.h,
      kind: preset.kind,
      category: preset.category
    };
    const updated = [minified, ...current.filter(p => p.id !== preset.id)].slice(0, 6);
    localStorage.setItem(KEY_RECENT_PRESETS, JSON.stringify(updated));
  } catch (e) {}
}

export function unitToPixels(value, unit, dpi = 300) {
  const num = parseFloat(value) || 0;
  switch (unit) {
    case 'cm':
      return Math.round((num / 2.54) * dpi);
    case 'mm':
      return Math.round((num / 25.4) * dpi);
    case 'inch':
      return Math.round(num * dpi);
    case 'px':
    default:
      return Math.round(num);
  }
}
