import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { runPostgresQuery } from './postgres.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const SALT_ROUNDS = 12;

export interface User {
  id: number;
  email: string;
  name: string | null;
  password_hash: string | null;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthTokenPayload {
  userId: number;
  email: string;
  iat?: number;
  exp?: number;
}

export interface PasswordResetToken {
  id: number;
  user_id: number;
  token: string;
  expires_at: string;
  used: boolean;
  created_at: string;
}

export interface OAuthAccount {
  id: number;
  user_id: number;
  provider: string;
  provider_account_id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// Password utilities
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// JWT utilities
export function generateAccessToken(user: Pick<User, 'id' | 'email'>): string {
  return jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyAccessToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
  } catch {
    return null;
  }
}

// Generate secure random tokens
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// User management
export async function createUser(email: string, password: string, name: string): Promise<User> {
  const passwordHash = await hashPassword(password);
  const [user] = await runPostgresQuery<User>(
    'insert into users(email, name, password_hash, updated_at) values($1, $2, $3, now()) returning *',
    [email, name, passwordHash],
  );
  return user;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const [user] = await runPostgresQuery<User>('select * from users where email = $1 limit 1', [
    email,
  ]);
  return user || null;
}

export async function findUserById(id: number): Promise<User | null> {
  const [user] = await runPostgresQuery<User>('select * from users where id = $1 limit 1', [id]);
  return user || null;
}

export async function updateUserPassword(userId: number, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  await runPostgresQuery('update users set password_hash = $1, updated_at = now() where id = $2', [
    passwordHash,
    userId,
  ]);
}

// Password reset tokens
export async function createPasswordResetToken(userId: number): Promise<PasswordResetToken> {
  const token = generateSecureToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  const [resetToken] = await runPostgresQuery<PasswordResetToken>(
    'insert into password_reset_tokens(user_id, token, expires_at) values($1, $2, $3) returning *',
    [userId, token, expiresAt],
  );
  return resetToken;
}

export async function findPasswordResetToken(token: string): Promise<PasswordResetToken | null> {
  const [resetToken] = await runPostgresQuery<PasswordResetToken>(
    'select * from password_reset_tokens where token = $1 and used = false and expires_at > now() limit 1',
    [token],
  );
  return resetToken || null;
}

export async function markPasswordResetTokenUsed(tokenId: number): Promise<void> {
  await runPostgresQuery('update password_reset_tokens set used = true where id = $1', [tokenId]);
}

// OAuth accounts
export async function createOrUpdateOAuthAccount(
  userId: number,
  provider: string,
  providerAccountId: string,
  accessToken?: string,
  refreshToken?: string,
  expiresAt?: Date,
): Promise<OAuthAccount> {
  const [account] = await runPostgresQuery<OAuthAccount>(
    `insert into oauth_accounts(user_id, provider, provider_account_id, access_token, refresh_token, expires_at, updated_at)
     values($1, $2, $3, $4, $5, $6, now())
     on conflict (provider, provider_account_id)
     do update set
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at,
       updated_at = now()
     returning *`,
    [
      userId,
      provider,
      providerAccountId,
      accessToken || null,
      refreshToken || null,
      expiresAt || null,
    ],
  );
  return account;
}

export async function findOAuthAccount(
  provider: string,
  providerAccountId: string,
): Promise<OAuthAccount | null> {
  const [account] = await runPostgresQuery<OAuthAccount>(
    'select * from oauth_accounts where provider = $1 and provider_account_id = $2 limit 1',
    [provider, providerAccountId],
  );
  return account || null;
}

// Session management
export async function createSession(userId: number): Promise<string> {
  const sessionId = generateSecureToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await runPostgresQuery('insert into user_sessions(id, user_id, expires_at) values($1, $2, $3)', [
    sessionId,
    userId,
    expiresAt,
  ]);

  return sessionId;
}

export async function findSessionUser(sessionId: string): Promise<User | null> {
  const [result] = await runPostgresQuery<User>(
    `select u.* from users u
     inner join user_sessions s on s.user_id = u.id
     where s.id = $1 and s.expires_at > now()
     limit 1`,
    [sessionId],
  );
  return result || null;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await runPostgresQuery('delete from user_sessions where id = $1', [sessionId]);
}

export async function deleteExpiredSessions(): Promise<void> {
  await runPostgresQuery('delete from user_sessions where expires_at <= now()');
}

// Input validation utilities
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPassword(password: string): boolean {
  // At least 8 characters, with at least one letter and one number
  return password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
}

export function getPasswordStrength(password: string): {
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) {
    score += 1;
  } else {
    feedback.push('Password should be at least 8 characters long');
  }

  if (password.length >= 12) {
    score += 1;
  }

  if (/[a-z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Include at least one lowercase letter');
  }

  if (/[A-Z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Include at least one uppercase letter');
  }

  if (/\d/.test(password)) {
    score += 1;
  } else {
    feedback.push('Include at least one number');
  }

  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>?]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Include at least one special character');
  }

  return { score, feedback };
}
