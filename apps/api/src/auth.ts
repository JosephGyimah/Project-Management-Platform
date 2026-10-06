import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { AuthTokenPayload, UserRole } from '@pmp/contracts';

const scrypt = promisify(scryptCallback);
const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 900);
const REFRESH_TOKEN_TTL_SECONDS = Number(process.env.REFRESH_TOKEN_TTL_SECONDS ?? 604800);
const TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET ?? 'dev-insecure-token-secret-change-me';

const toBase64Url = (value: string | Buffer): string =>
  Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const fromBase64Url = (value: string): Buffer => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
};

const sign = (value: string): string => toBase64Url(createHmac('sha256', TOKEN_SECRET).update(value).digest());

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
};

export const verifyPassword = async (password: string, encoded: string): Promise<boolean> => {
  const [salt, hashHex] = encoded.split(':');
  if (!salt || !hashHex) return false;
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hashHex, 'hex');
  return expected.length === hash.length && timingSafeEqual(expected, hash);
};

export const createAccessToken = (payload: { sub: string; email: string; role: UserRole }): string => {
  const body: AuthTokenPayload = {
    sub: payload.sub,
    email: payload.email,
    role: payload.role,
    exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS
  };
  const encoded = toBase64Url(JSON.stringify(body));
  return `${encoded}.${sign(encoded)}`;
};

export const verifyAccessToken = (token: string): AuthTokenPayload | null => {
  const [encodedPayload, encodedSignature] = token.split('.');
  if (!encodedPayload || !encodedSignature) return null;

  const expected = sign(encodedPayload);
  const signature = Buffer.from(encodedSignature);
  const expectedBuffer = Buffer.from(expected);
  if (signature.length !== expectedBuffer.length || !timingSafeEqual(signature, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload).toString('utf8')) as AuthTokenPayload;
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (!payload.sub || !payload.email || !payload.role) return null;
    return payload;
  } catch {
    return null;
  }
};

export const createRefreshToken = (): string => toBase64Url(randomBytes(48));

export const hashRefreshToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export const refreshExpiryDate = (): Date => new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

export const refreshMaxAgeMs = (): number => REFRESH_TOKEN_TTL_SECONDS * 1000;

export const parseCookie = (cookieHeader: string | undefined, name: string): string | null => {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';').map((part) => part.trim());
  for (const part of parts) {
    const [key, ...valueParts] = part.split('=');
    if (key === name) {
      return decodeURIComponent(valueParts.join('='));
    }
  }
  return null;
};
