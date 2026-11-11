/** Australia mobile: 04xx xxx xxx or +61 4xx xxx xxx. */
export function isAuMobile(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("04")) return true;
  if (digits.length === 11 && digits.startsWith("614")) return true;
  return false;
}

export function formatAuMobileHint(lang: "en" | "zh-CN" | "vi") {
  if (lang === "vi") return "Số di động Úc, ví dụ 04xx xxx xxx";
  return lang === "zh-CN"
    ? "澳大利亚手机号，例如 04xx xxx xxx"
    : "Australian mobile, e.g. 04xx xxx xxx";
}
