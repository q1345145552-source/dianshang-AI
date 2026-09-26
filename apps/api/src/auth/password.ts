import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// 密码规则：至少 8 位，而且不能只用一种字符。
// 纯数字或者纯字母都算太简单，要拦住并单独提示。
const MIN_LENGTH = 8;

export type PasswordProblem = 'too_short' | 'too_weak' | null;

export function checkPassword(password: string): PasswordProblem {
  if (password.length < MIN_LENGTH) {
    return 'too_short';
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  if (!hasLetter || !hasDigit) {
    return 'too_weak';
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) {
    return false;
  }

  const expected = Buffer.from(hashHex, 'hex');
  const derived = (await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length)) as Buffer;

  if (derived.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(derived, expected);
}

// 邮箱根本不存在的时候，也拿这个假哈希走一遍同样的运算。
// 不然光看响应快慢，就能猜出这个邮箱到底注册没注册。
export const ABSENT_USER_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;
