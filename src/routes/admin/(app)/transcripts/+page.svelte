<script lang="ts">
	import { formatDate, truncate } from '../../format';
	import type { PageData } from './$types';

	export let data: PageData;

	function versions(first: number | null, last: number | null): string {
		if (first === null && last === null) return 'defaults';
		if (first === last) return `#${first}`;
		return `#${first ?? 'defaults'} → #${last}`;
	}
</script>

<svelte:head>
	<title>Transcripts · Admin</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-end gap-2">
		<div class="flex-1">
			<h1 class="text-2xl font-semibold">Transcripts</h1>
			<p class="text-sm text-base-content/70">
				{data.total.toLocaleString()} conversation{data.total === 1 ? '' : 's'}. One page visit is one
				conversation. Newest activity first.
			</p>
		</div>
		<a class="btn btn-sm" href="/admin/export/messages.csv" download>Download all messages (CSV)</a>
		<a class="btn btn-sm btn-ghost" href="/admin/export/versions.csv" download>
			Download prompt versions (CSV)
		</a>
	</div>

	{#if data.dbError}
		<div role="alert" class="alert alert-error"><span>Database error: {data.dbError}</span></div>
	{:else if data.dbMode === 'none'}
		<div role="alert" class="alert alert-warning">
			<span>
				No database is connected, so conversations aren't being recorded. Set TURSO_DATABASE_URL and
				TURSO_AUTH_TOKEN.
			</span>
		</div>
	{:else if data.conversations.length === 0}
		<div class="card bg-base-100 shadow-sm">
			<div class="card-body text-sm text-base-content/70">
				No conversations yet. They appear here as soon as someone sends a message on the chat page.
			</div>
		</div>
	{:else}
		<div class="card bg-base-100 shadow-sm overflow-x-auto">
			<table class="table table-sm">
				<thead>
					<tr>
						<th>Started</th>
						<th>Last message</th>
						<th class="text-right">Visitor messages</th>
						<th>Prompt version</th>
						<th>First message</th>
					</tr>
				</thead>
				<tbody>
					{#each data.conversations as conversation (conversation.id)}
						<tr class="hover">
							<td class="whitespace-nowrap">
								<a class="link link-hover" href="/admin/transcripts/{conversation.id}">
									{formatDate(conversation.startedAt)}
								</a>
							</td>
							<td class="whitespace-nowrap">{formatDate(conversation.lastAt)}</td>
							<td class="text-right">{conversation.userMessages}</td>
							<td class="whitespace-nowrap">
								{versions(conversation.firstConfigId, conversation.lastConfigId)}
							</td>
							<td class="min-w-64">
								<a class="link link-hover" href="/admin/transcripts/{conversation.id}">
									{truncate(conversation.preview, 120) || '(no visitor message)'}
								</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if data.pageCount > 1}
			<div class="join self-center">
				<a
					class="join-item btn btn-sm"
					class:btn-disabled={data.page <= 1}
					href="?page={data.page - 1}">«</a
				>
				<span class="join-item btn btn-sm no-animation">Page {data.page} of {data.pageCount}</span>
				<a
					class="join-item btn btn-sm"
					class:btn-disabled={data.page >= data.pageCount}
					href="?page={data.page + 1}">»</a
				>
			</div>
		{/if}
	{/if}
</div>
