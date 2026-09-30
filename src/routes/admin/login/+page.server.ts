import {
	SESSION_COOKIE,
	SESSION_MAX_AGE_SECONDS,
	adminPasswordProblem,
	checkPassword,
	createSessionToken,
	isValidSessionToken
} from '$lib/server/auth';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const FAILED_LOGIN_DELAY_MS = 1_000;

export const load: PageServerLoad = async ({ cookies }) => {
	if (isValidSessionToken(cookies.get(SESSION_COOKIE))) redirect(303, '/admin');
	return { problem: adminPasswordProblem() };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const problem = adminPasswordProblem();
		if (problem) return fail(503, { error: problem });

		const password = String((await request.formData()).get('password') ?? '');
		if (!checkPassword(password)) {
			// Slows down guessing a little. The minimum password length does the real work.
			await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS));
			return fail(401, { error: 'Wrong password.' });
		}

		cookies.set(SESSION_COOKIE, createSessionToken(), {
			path: '/admin',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: SESSION_MAX_AGE_SECONDS
		});
		redirect(303, '/admin');
	}
};
