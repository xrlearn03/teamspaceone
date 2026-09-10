import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey(secret?: string): Buffer {
  if (!secret) {
    throw new Error('ORGANISATION_EMAIL_ENCRYPTION_KEY is not configured');
  }
  return createHash('sha256').update(secret).digest();
}

export function encryptString(plainText: string, secret: string): string {
  const key = getKey(secret);
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${encrypted.toString('base64')}:${tag.toString('base64')}:${iv.toString('base64')}`;
}

export function decryptString(cipherText: string, secret: string): string | null {
  try {
    const key = getKey(secret);
    const parts = cipherText.split(':');
    if (parts.length !== 3) return null;
    const [encryptedB64, tagB64, ivB64] = parts;
    if (!encryptedB64 || !tagB64 || !ivB64) return null;
    const encrypted = Buffer.from(encryptedB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
