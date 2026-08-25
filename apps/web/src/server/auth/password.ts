import bcrypt from "bcryptjs";

// Cost factor 12 is a reasonable 2026 baseline for bcrypt (~250ms/hash on
// modest hardware) — high enough to make offline brute-forcing expensive,
// low enough not to make login noticeably slow. bcryptjs (pure JS) is used
// instead of native bcrypt to keep the app portable across deploy targets
// (including serverless) without a native build step.
const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

const MIN_PASSWORD_LENGTH = 10;

export function validatePasswordStrength(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return "Password must include both uppercase and lowercase letters.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must include at least one number.";
  }
  return null;
}
