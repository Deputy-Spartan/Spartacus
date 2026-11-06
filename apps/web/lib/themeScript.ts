// Runs in <head> before the page paints (see app/layout.tsx), so the saved
// theme shows straight away instead of flashing the default first.
// Kept out of userPrefs.tsx because that file is client-only.
export const PREFS_CACHE_KEY = "spartacus_prefs";

export const EARLY_THEME_SCRIPT = `try{var p=JSON.parse(localStorage.getItem("${PREFS_CACHE_KEY}")||"{}");var t=p.theme;if(t!=="glass"&&t!=="neon")t="studio";document.documentElement.dataset.theme=t;if(p.reduceMotion)document.documentElement.dataset.motion="reduce";}catch(e){document.documentElement.dataset.theme="studio";}`;
