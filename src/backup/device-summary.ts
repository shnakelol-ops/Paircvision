/** Coarse device/browser label for backup metadata — no identifiers. */
export function getDeviceSummary(userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""): string {
  const ua = userAgent.toLowerCase();

  let os = "Unknown OS";
  if (ua.includes("android")) os = "Android";
  else if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) os = "iOS";
  else if (ua.includes("mac os")) os = "macOS";
  else if (ua.includes("windows")) os = "Windows";
  else if (ua.includes("linux")) os = "Linux";

  let browser = "Browser";
  if (ua.includes("edg/")) browser = "Edge";
  else if (ua.includes("crios/")) browser = "Chrome";
  else if (ua.includes("chrome/") && !ua.includes("edg/")) browser = "Chrome";
  else if (ua.includes("fxios/") || ua.includes("firefox/")) browser = "Firefox";
  else if (ua.includes("safari/") && !ua.includes("chrome/") && !ua.includes("crios/")) browser = "Safari";

  return `${os} ${browser}`;
}
