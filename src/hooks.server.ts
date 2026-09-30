import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, isValidSessionToken } from '$lib/server/auth';

// Chrome DevTools probes this path whenever DevTools is open on localhost, looking for an
// optional file that maps the site to a folder on disk (its Workspace feature). We do not
// provide one, so SvelteKit's router logs a 404 for every probe. Answering 204 No Content
// keeps the dev server log readable without affecting any real route.
const CHROME_DEVTOOLS_PROBE = '/.well-known/appspecific/com.chrome.devtools.json';

const ADMIN_LOGIN = '/admin/login';

function isAdminPath(pathname: string): boolean {
	return pathname === '/admin' || pathname.startsWith('/admin/');
}

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	if (pathname === CHROME_DEVTOOLS_PROBE) {
		return new Response(null, { status: 204 });
	}

	if (!isAdminPath(pathname)) {
		return resolve(event);
	}

	// Checked here rather than in a layout load, because hooks run for every request, including
	// form actions and +server endpoints, which a layout load does not guard.
	if (pathname !== ADMIN_LOGIN && !isValidSessionToken(event.cookies.get(SESSION_COOKIE))) {
		if (event.request.method === 'GET') {
			return new Response(null, { status: 303, headers: { location: ADMIN_LOGIN } });
		}
		return new Response('Unauthorized', { status: 401 });
	}

	const response = await resolve(event);
	response.headers.set('Cache-Control', 'no-store');
	response.headers.set('X-Robots-Tag', 'noindex, nofollow');
	return response;
};
