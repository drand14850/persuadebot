import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

// Single-user admin login. The only secret is ADMIN_PASSWORD. The session cookie is
// "<expiry>.<HMAC of expiry keyed by the password>", so no session store is needed and
// changing the password signs out every existing session.

export const SESSION_COOKIE = 'admin_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const MIN_PASSWORD_LENGTH = 12;

// Returns a message explaining why admin login is unavailable, or null when it is usable.
// A short password is refused outright: /admin is on the public internet and there is no
// lockout, so length is what makes guessing impractical.
export function adminPasswordProblem(): string | null {
	const password = env.ADMIN_PASSWORD;
	if (!password) return 'ADMIN_PASSWORD is not set.';
	if (password.length < MIN_PASSWORD_LENGTH) {
		return `ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
	}
	return null;
}

function digest(value: string): Buffer {
	return createHash('sha256').update(value).digest();
}

export function checkPassword(candidate: string): boolean {
	if (adminPasswordProblem()) return false;
	// Hashing both sides first gives equal-length buffers, which timingSafeEqual requires.
	return timingSafeEqual(digest(candidate), digest(env.ADMIN_PASSWORD!));
}

function sign(expiresAt: number): string {
	return createHmac('sha256', env.ADMIN_PASSWORD!).update(`admin-session:${expiresAt}`).digest('hex');
}

export function createSessionToken(): string {
	const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
	return `${expiresAt}.${sign(expiresAt)}`;
}

export function isValidSessionToken(token: string | undefined): boolean {
	if (!token || adminPasswordProblem()) return false;

	const [expiresRaw, signature] = token.split('.');
	const expiresAt = Number(expiresRaw);
	if (!Number.isFinite(expiresAt) || expiresAt < Date.now() || !signature) return false;

	const expected = Buffer.from(sign(expiresAt), 'hex');
	const given = Buffer.from(signature, 'hex');
	return given.length === expected.length && timingSafeEqual(given, expected);
}
