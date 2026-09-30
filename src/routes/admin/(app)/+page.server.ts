import { env } from '$env/dynamic/private';
import { logger } from '$lib/logger';
import { BotConfigSchema, DEFAULT_CONFIG, type BotConfig } from '$lib/server/botConfig';
import {
	dbMode,
	getCurrentConfig,
	listConfigVersions,
	saveConfig,
	type ConfigVersion,
	type LoadedConfig
} from '$lib/server/db';
import { getModelOptions } from '$lib/server/openrouter';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const VERSIONS_SHOWN = 25;

export const load: PageServerLoad = async () => {
	const mode = dbMode();
	let current: LoadedConfig = { id: null, savedAt: null, config: DEFAULT_CONFIG };
	let versions: ConfigVersion[] = [];
	let dbError: string | null = null;

	if (mode !== 'none') {
		try {
			current = await getCurrentConfig();
			versions = await listConfigVersions(VERSIONS_SHOWN);
		} catch (error) {
			logger.error(error, 'Admin page could not read the database:');
			dbError = (error as Error).message;
		}
	}

	return {
		current,
		versions,
		defaults: DEFAULT_CONFIG,
		dbMode: mode,
		dbError,
		openRouterKeySet: Boolean(env.OPENROUTER_API_KEY),
		models: await getModelOptions()
	};
};

function text(form: FormData, key: string): string {
	// Browsers submit textarea line breaks as \r\n; store plain \n.
	return String(form.get(key) ?? '').replace(/\r\n/g, '\n');
}

function numberOrNull(raw: string): number | null {
	return raw.trim() === '' ? null : Number(raw);
}

export const actions: Actions = {
	save: async ({ request }) => {
		const form = await request.formData();
		const values: Record<keyof BotConfig, unknown> = {
			title: text(form, 'title'),
			systemPrompt: text(form, 'systemPrompt'),
			greeting: text(form, 'greeting'),
			model: text(form, 'model'),
			temperature: numberOrNull(text(form, 'temperature')),
			maxTokens: Number(text(form, 'maxTokens')),
			maxUserMessages: Number(text(form, 'maxUserMessages')),
			placeholder: text(form, 'placeholder'),
			notice: text(form, 'notice'),
			endText: text(form, 'endText'),
			avatarUrl: text(form, 'avatarUrl').trim()
		};
		const note = text(form, 'note').trim().slice(0, 500);

		const parsed = BotConfigSchema.safeParse(values);
		if (!parsed.success) {
			return fail(400, { errors: parsed.error.flatten().fieldErrors, saveError: null });
		}

		if (dbMode() === 'none') {
			return fail(503, {
				errors: {},
				saveError:
					'No database is connected, so settings cannot be saved. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to the environment variables and redeploy.'
			});
		}

		try {
			const savedId = await saveConfig(parsed.data, note);
			return { savedId };
		} catch (error) {
			logger.error(error, 'Could not save bot config:');
			return fail(500, { errors: {}, saveError: `Could not save: ${(error as Error).message}` });
		}
	}
};
