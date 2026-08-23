export function normalizeEmail(value: string): string {
  return value.normalize("NFC").trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email);
}

export function isValidEmailCode(value: string): boolean {
  return /^[a-z0-9]{6}$/iu.test(value.trim());
}
