// import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import adapter from '@sveltejs/adapter-vercel';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://kit.svelte.dev/docs/adapters for more information about adapters.
		// https://vercel.com/docs/functions/configuring-functions/duration
		// Pin the function runtime so it no longer depends on whatever Node the Vercel
		// build image happens to run. Without this the adapter infers it from the build
		// Node and only knows 18/20, so a Vercel image upgrade breaks the build.
		adapter: adapter({ maxDuration: 300, runtime: 'nodejs24.x' })
	}
};

export default config;
