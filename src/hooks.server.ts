import type { Handle } from '@sveltejs/kit';

// Chrome DevTools probes this path whenever DevTools is open on localhost, looking for an
// optional file that maps the site to a folder on disk (its Workspace feature). We do not
// provide one, so SvelteKit's router logs a 404 for every probe. Answering 204 No Content
// keeps the dev server log readable without affecting any real route.
const CHROME_DEVTOOLS_PROBE = '/.well-known/appspecific/com.chrome.devtools.json';

export const handle: Handle = async ({ event, resolve }) => {
	if (event.url.pathname === CHROME_DEVTOOLS_PROBE) {
		return new Response(null, { status: 204 });
	}
	return resolve(event);
};
