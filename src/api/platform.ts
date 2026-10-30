// Entspricht Obsidians `Platform`. Wir sind weder die Desktop- noch die Mobile-App;
// Plugins sollen sich wie in einer Desktop-Umgebung ohne Electron verhalten.
const ua = navigator.userAgent;
const isMobileUa = /Android|iPhone|iPad|iPod/i.test(ua);

export const Platform = {
  isDesktop: !isMobileUa,
  isMobile: isMobileUa,
  isDesktopApp: false,
  isMobileApp: false,
  isIosApp: false,
  isAndroidApp: false,
  isPhone: /iPhone|Android.*Mobile/i.test(ua),
  isTablet: /iPad/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)),
  isMacOS: /Macintosh|Mac OS X/i.test(ua),
  isWin: /Windows/i.test(ua),
  isLinux: /Linux/i.test(ua) && !/Android/i.test(ua),
  isSafari: /^((?!chrome|android).)*safari/i.test(ua),
};

/** API-Version, die obsidian-web gegenüber Plugins angibt. */
export const apiVersion = "1.7.7";

export function requireApiVersion(version: string): boolean {
  const a = apiVersion.split(".").map(Number);
  const b = version.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}
