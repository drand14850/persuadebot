import { env } from '$env/dynamic/private';
import type { BotConfig } from '$lib/server/botConfig';
import { ChatOpenAI } from '@langchain/openai';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// https://openrouter.ai/docs/guides/features/server-tools/web-search
// OpenRouter runs the search itself, so the model can search zero or more times per reply and
// nothing here has to execute the tool.
const WEB_SEARCH_TOOL = { type: 'openrouter:web_search' };

// Searching spends output tokens before the visible reply starts (the search call itself, and
// models like Claude reason about the results). Tested 2026-09-30 with Claude Sonnet 5.5 and a
// 300-token cap: it ran out after the search and the visitor got no text at all. So when search
// is on, "Longest reply" keeps meaning the visible reply and this is added on top. Tokens are
// only billed when used.
const SEARCH_TOKEN_ALLOWANCE = 1_000;

// https://openrouter.ai/docs/guides/features/web-search
// The ":online" variant searches once before every reply.
function modelId(config: BotConfig): string {
	if (config.webSearch === 'always' && !config.model.endsWith(':online')) {
		return `${config.model}:online`;
	}
	return config.model;
}

// OpenRouter speaks the OpenAI chat API, so the OpenAI client works unchanged. The key comes
// from the server environment only; nothing the browser sends can change the key, model or
// endpoint.
export const createChatModel = (config: BotConfig) => {
	//https://v02.api.js.langchain.com/classes/langchain_openai.ChatOpenAI.html
	const model = new ChatOpenAI({
		streaming: true,
		model: modelId(config),
		apiKey: env.OPENROUTER_API_KEY,
		temperature: config.temperature ?? undefined,
		maxTokens: config.webSearch === 'off' ? config.maxTokens : config.maxTokens + SEARCH_TOKEN_ALLOWANCE,
		maxRetries: 2,
		timeout: 120_000, // milliseconds
		// modelKwargs is copied into the request body as is. Passing the tool through the call
		// options instead would make LangChain try to convert it into a function definition.
		modelKwargs: config.webSearch === 'auto' ? { tools: [WEB_SEARCH_TOOL] } : {},
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
