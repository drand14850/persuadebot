import { SESSION_COOKIE } from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// POST only, so a link or image elsewhere cannot log the admin out.
export const POST: RequestHandler = async ({ cookies }) => {
	cookies.delete(SESSION_COOKIE, { path: '/admin' });
	redirect(303, '/admin/login');
};
