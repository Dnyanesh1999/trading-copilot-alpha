import { validateReviewEntry } from "../src/core/saved-review";
const encode = (a: Uint8Array) =>
  btoa(Array.from(a, (b) => String.fromCharCode(b)).join(""));
const decode = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function key(secret: string) {
  const raw = decode(secret);
  if (raw.length !== 32) throw Error("Review vault unavailable");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function sealReview(
  secret: string,
  owner: string,
  id: string,
  value: unknown,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(owner + ":" + id),
    },
    await key(secret),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return JSON.stringify({
    v: 1,
    iv: encode(iv),
    data: encode(new Uint8Array(encrypted)),
  });
}
export async function openReview(
  secret: string,
  owner: string,
  id: string,
  sealed: string,
) {
  const envelope = JSON.parse(sealed);
  if (envelope.v !== 1) throw Error("Unsupported review version");
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decode(envelope.iv),
      additionalData: new TextEncoder().encode(owner + ":" + id),
    },
    await key(secret),
    decode(envelope.data),
  );
  const entry = validateReviewEntry(
    JSON.parse(new TextDecoder().decode(decrypted)),
  );
  if (!entry || entry.id !== id) throw Error("Invalid saved review");
  return entry;
}
