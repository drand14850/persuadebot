import { logger } from '$lib/logger';
import { toPublicConfig } from '$lib/server/botConfig';
import { getCurrentConfig } from '$lib/server/db';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Only display settings reach the browser. The prompt and model stay on the server.
export const load: PageServerLoad = async () => {
	try {
		const { config } = await getCurrentConfig();
		return { bot: toPublicConfig(config) };
	} catch (err) {
		logger.error(err, 'Could not load bot config for the chat page:');
		error(503, 'The chat is temporarily unavailable. Please try again shortly.');
	}
};
