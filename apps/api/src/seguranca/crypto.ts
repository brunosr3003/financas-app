/**
 * Criptografia de campo (LGPD): AES-256-GCM com chave em DATA_KEY (32 bytes hex).
 * Formato armazenado: "enc:<iv>:<tag>:<cifrado>" (base64) — valores legados em
 * texto puro continuam legiveis (dec() devolve como esta se nao tiver prefixo).
 * Campos cifrados nao sao pesquisaveis em SQL: busca = decifrar e filtrar na app.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../env.js";

const PREFIXO = "enc:";
const key = Buffer.from(env.DATA_KEY, "hex");

export function enc(texto: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const cifrado = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIXO}${iv.toString("base64")}:${tag.toString("base64")}:${cifrado.toString("base64")}`;
}

export function dec(armazenado: string): string {
  if (!armazenado.startsWith(PREFIXO)) return armazenado;
  const [ivB64, tagB64, dadoB64] = armazenado.slice(PREFIXO.length).split(":");
  if (!ivB64 || !tagB64 || !dadoB64) throw new Error("payload cifrado malformado");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dadoB64, "base64")), decipher.final()]).toString("utf8");
}
