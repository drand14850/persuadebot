import { csvResponse, toCsv } from '$lib/server/csv';
import { listAllConfigVersions } from '$lib/server/db';
import type { RequestHandler } from './$types';

// Admin only: hooks.server.ts rejects requests without a session before this runs.
// prompt_version here matches prompt_version in the transcripts export.
export const GET: RequestHandler = async () => {
	const versions = await listAllConfigVersions();
	const csv = toCsv(
		[
			'prompt_version',
			'saved_at_utc',
			'note',
			'model',
			'temperature',
			'max_tokens',
			'web_search',
			'max_user_messages',
			'system_prompt',
			'greeting',
			'config_json'
		],
		versions.map((v) => [
			v.id,
			v.savedAt,
			v.note,
			v.config.model,
			v.config.temperature,
			v.config.maxTokens,
			v.config.webSearch,
			v.config.maxUserMessages,
			v.config.systemPrompt,
			v.config.greeting,
			JSON.stringify(v.config)
		])
	);
	return csvResponse(`prompt-versions-${new Date().toISOString().slice(0, 10)}.csv`, csv);
};
