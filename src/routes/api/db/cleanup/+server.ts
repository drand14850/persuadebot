import { logger } from '$lib/logger';
import { pruneOldRows, RETENTION_DAYS } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

// PERMANENTLY DELETES study data older than the retention window. Vercel Cron calls this
// daily (see vercel.json). There is no undo and no backup step: rows removed here are gone.
//
// CRON_SECRET is the only thing standing between the public internet and that deletion.
// The name is fixed by Vercel, which sends the value of a variable called exactly CRON_SECRET
// as the Authorization header on cron invocations. Renaming it means no header is sent and
// every scheduled run is rejected, so retention silently stops. Do not rename it.
//
// Add `?dryRun=1` to report what WOULD be deleted without touching anything. Use that first.
export const GET: RequestHandler = async ({ request, url }): Promise<Response> => {
	const secret = env.CRON_SECRET;

	// Fail closed. Without a secret configured this route would let anyone wipe study data,
	// so a missing secret disables it rather than leaving it open.
	if (!secret) {
		logger.error('CRON_SECRET is not set; refusing to run cleanup.');
		return new Response('Cleanup not configured', { status: 503 });
	}

	if (request.headers.get('authorization') !== `Bearer ${secret}`) {
		logger.warn('Rejected unauthorised cleanup request.');
		return new Response('Unauthorized', { status: 401 });
	}

	const dryRun = url.searchParams.get('dryRun') === '1';

	try {
		const result = await pruneOldRows(dryRun);
		// warn, not info: production logs start at warn, and this once-a-day line is the only
		// evidence the retention cron ran at all. Losing it would hide a silently broken cron.
		logger.warn(
			`Cleanup (${RETENTION_DAYS}d retention, cutoff ${result.cutoff})` +
				`${result.dryRun ? ' DRY RUN' : ''}: ` +
				`${result.messages} messages, ${result.highlights} highlights`
		);
		return new Response(JSON.stringify({ retentionDays: RETENTION_DAYS, ...result }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		logger.error(error, 'Cleanup failed:');
		return new Response('Cleanup failed', { status: 500 });
	}
};
