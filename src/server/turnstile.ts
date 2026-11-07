import { getServerEnv, isMockOnboarding } from "./env";

export async function verifyTurnstile(
  token: string | undefined | null,
  ip?: string,
): Promise<boolean> {
  if (isMockOnboarding()) return true;
  if (!token) return false;
  const { turnstileSecretKey } = getServerEnv();
  if (!turnstileSecretKey) return false;
  const body = new URLSearchParams();
  body.set("secret", turnstileSecretKey);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });
  if (!response.ok) return false;
  const json = (await response.json()) as { success?: boolean };
  return Boolean(json.success);
}
