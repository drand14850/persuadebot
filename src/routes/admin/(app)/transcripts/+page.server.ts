import { logger } from '$lib/logger';
import { countConversations, dbMode, listConversations, type ConversationSummary } from '$lib/server/db';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ url }) => {
	const page = Math.max(1, Math.floor(Number(url.searchParams.get('page')) || 1));
	const mode = dbMode();

	let conversations: ConversationSummary[] = [];
	let total = 0;
	let dbError: string | null = null;

	if (mode !== 'none') {
		try {
			total = await countConversations();
			conversations = await listConversations(PAGE_SIZE, (page - 1) * PAGE_SIZE);
		} catch (error) {
			logger.error(error, 'Could not list transcripts:');
			dbError = (error as Error).message;
		}
	}

	return {
		conversations,
		total,
		page,
		pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
		dbMode: mode,
		dbError
	};
};
