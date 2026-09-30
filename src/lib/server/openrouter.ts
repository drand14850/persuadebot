import { logger } from '$lib/logger';

// OpenRouter's model catalogue, used to suggest model ids on the admin page. The endpoint is
// public (no key needed). Cached per server instance so the admin page stays fast.

export interface ModelOption {
	id: string;
	label: string; // name and price per million tokens, shown next to the id
}

const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const CACHE_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;

let cache: { at: number; models: ModelOption[] } | null = null;

interface OpenRouterModel {
	id: string;
	name?: string;
	pricing?: { prompt?: string; completion?: string };
}

function perMillion(price: string | undefined): string {
	const value = Number(price) * 1_000_000;
	if (!Number.isFinite(value)) return '?';
	return value === 0 ? 'free' : `$${value.toFixed(2)}`;
}

// Returns [] when OpenRouter is unreachable; the admin page then just has no suggestions.
export async function getModelOptions(): Promise<ModelOption[]> {
	if (cache && Date.now() - cache.at < CACHE_MS) return cache.models;

	try {
		const response = await fetch(MODELS_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const body = (await response.json()) as { data: OpenRouterModel[] };

		const models = body.data
			// Batch variants are for offline jobs, not live chat.
			.filter((m) => !m.id.endsWith(':batch'))
			.map((m) => ({
				id: m.id,
				label: `${m.name ?? m.id} · in ${perMillion(m.pricing?.prompt)}/M · out ${perMillion(m.pricing?.completion)}/M tokens`
			}))
			.sort((a, b) => a.id.localeCompare(b.id));

		cache = { at: Date.now(), models };
		return models;
	} catch (error) {
		logger.warn(`Could not fetch the OpenRouter model list: ${(error as Error).message}`);
		return cache?.models ?? [];
	}
}
