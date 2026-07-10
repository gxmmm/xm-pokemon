/** Auth helpers using Web Crypto (PBKDF2). No external deps. */

const PBKDF2_ITERATIONS = 100_000;

export function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return bytesToHex(arr);
}

export function bytesToHex(arr: Uint8Array): string {
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}

export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = hexToBytes(saltHex);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

export function newToken(): string {
  return randomHex(32);
}

export function newPlayerId(): string {
  return 'u_' + randomHex(8);
}

/** Username validation: 3-20 chars, alphanumeric + underscore, case-insensitive. */
export function validUsername(name: string): boolean {
  return typeof name === 'string' && /^[a-zA-Z0-9_一-龥]{2,20}$/.test(name);
}

export function validPassword(pw: string): boolean {
  return typeof pw === 'string' && pw.length >= 4 && pw.length <= 100;
}
