import { z } from 'zod';

// Everything the designer can change from /admin. The system prompt and model never leave the
// server; the browser only ever receives the fields in PublicBotConfig.

export const BotConfigSchema = z.object({
	title: z.string().trim().max(100),
	systemPrompt: z.string().max(100_000),
	greeting: z.string().max(5_000),
	// OpenRouter model id, e.g. "anthropic/claude-sonnet-5.5" or "openai/gpt-6-luna:online".
	model: z
		.string()
		.trim()
		.min(1, 'Model is required')
		.max(200)
		.regex(/^[\w.\-/:]+$/, 'Model id may only contain letters, numbers and . - _ / :'),
	// null means "use the model's own default".
	temperature: z.number().min(0).max(2).nullable(),
	// Capped so a reply always fits MAX_ASSISTANT_MESSAGE_CHARS in /api/chat (~4 chars/token).
	maxTokens: z.number().int().min(16).max(8_000),
	// 0 means unlimited.
	maxUserMessages: z.number().int().min(0).max(1_000),
	placeholder: z.string().max(200),
	notice: z.string().max(1_000),
	endText: z.string().max(1_000),
	avatarUrl: z.union([
		z.literal(''),
		z.string().trim().url().max(2_000).startsWith('https://', 'Avatar URL must start with https://')
	])
});

export type BotConfig = z.infer<typeof BotConfigSchema>;

// Used until the first save from /admin, and as the base that stored configs are merged onto,
// so a field added here later still has a value for configs saved before it existed.
export const DEFAULT_CONFIG: BotConfig = {
	title: 'Chat',
	systemPrompt:
		'You are a friendly, helpful assistant on a public website. Keep replies short (two to four sentences) unless the visitor asks for more detail.',
	greeting: 'Hi! What would you like to talk about?',
	model: 'anthropic/claude-sonnet-5.5',
	temperature: null,
	maxTokens: 800,
	maxUserMessages: 30,
	placeholder: 'Type a message...',
	notice: 'Conversations on this page are recorded and may be reviewed.',
	endText: 'This conversation has reached its limit. Thanks for chatting!',
	avatarUrl: ''
};

export interface PublicBotConfig {
	title: string;
	greeting: string;
	maxUserMessages: number;
	placeholder: string;
	notice: string;
	endText: string;
	avatarUrl: string;
}

export function toPublicConfig(config: BotConfig): PublicBotConfig {
	return {
		title: config.title,
		greeting: config.greeting,
		maxUserMessages: config.maxUserMessages,
		placeholder: config.placeholder,
		notice: config.notice,
		endText: config.endText,
		avatarUrl: config.avatarUrl
	};
}

// Stored configs are merged onto the defaults and re-validated. A row that no longer validates
// (say a limit was tightened) falls back to the defaults for the offending fields only.
export function parseStoredConfig(json: string): BotConfig {
	const merged = { ...DEFAULT_CONFIG, ...(JSON.parse(json) as Partial<BotConfig>) };
	const parsed = BotConfigSchema.safeParse(merged);
	if (parsed.success) return parsed.data;

	const repaired: Record<string, unknown> = { ...merged };
	for (const issue of parsed.error.issues) {
		const key = issue.path[0] as keyof BotConfig;
		repaired[key] = DEFAULT_CONFIG[key];
	}
	return BotConfigSchema.parse(repaired);
}
