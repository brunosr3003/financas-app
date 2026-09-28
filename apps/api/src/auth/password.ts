import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(senha: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(senha, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(senha: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(senha, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}
