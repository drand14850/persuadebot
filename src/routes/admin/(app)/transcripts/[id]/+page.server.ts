import { getConfigVersions, getConversation } from '$lib/server/db';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const messages = await getConversation(params.id);
	if (messages.length === 0) error(404, 'Conversation not found');

	const configIds = [...new Set(messages.map((m) => m.configId).filter((id): id is number => id !== null))];
	const versions = await getConfigVersions(configIds);

	return { conversationId: params.id, messages, versions };
};
