import { env } from '$env/dynamic/private';
import type { BotConfig } from '$lib/server/botConfig';
import { ChatOpenAI } from '@langchain/openai';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// OpenRouter speaks the OpenAI chat API, so the OpenAI client works unchanged. The key comes
// from the server environment only; nothing the browser sends can change the key, model or
// endpoint.
export const createChatModel = (config: BotConfig) => {
	//https://v02.api.js.langchain.com/classes/langchain_openai.ChatOpenAI.html
	const model = new ChatOpenAI({
		streaming: true,
		model: config.model,
		apiKey: env.OPENROUTER_API_KEY,
		temperature: config.temperature ?? undefined,
		maxTokens: config.maxTokens,
		maxRetries: 2,
		timeout: 120_000, // milliseconds
		configuration: {
			// OPENROUTER_BASE_URL is only for pointing local tests at a stub server.
			baseURL: env.OPENROUTER_BASE_URL || OPENROUTER_BASE_URL
		}
	});
	if (config.temperature === null) {
		// ChatOpenAI falls back to temperature 1 when none is given. Clearing it leaves the field
		// out of the request, so the model's own default applies as the admin page promises.
		(model as { temperature?: number }).temperature = undefined;
	}
	return model;
};
