<script lang="ts">
	import { formatDate } from '../../../format';
	import type { PageData } from './$types';

	export let data: PageData;

	$: startedAt = data.messages[0]?.createdAt ?? null;
</script>

<svelte:head>
	<title>Transcript · Admin</title>
</svelte:head>

<div class="flex flex-col gap-4 max-w-3xl">
	<div>
		<a href="/admin/transcripts" class="link link-hover text-sm">← All transcripts</a>
		<h1 class="text-2xl font-semibold mt-1">Conversation from {formatDate(startedAt)}</h1>
		<p class="text-xs text-base-content/60 font-mono break-all">{data.conversationId}</p>
	</div>

	{#each data.versions as version (version.id)}
		<details class="collapse collapse-arrow bg-base-100 shadow-sm">
			<summary class="collapse-title text-sm font-medium">
				Prompt version #{version.id} · {version.config.model}
				<span class="text-base-content/60 font-normal">· saved {formatDate(version.savedAt)}</span>
			</summary>
			<div class="collapse-content">
				<!-- Plain text on purpose: none of this is rendered as HTML. -->
				<pre class="whitespace-pre-wrap text-xs font-mono bg-base-200 rounded-lg p-3">{version.config
						.systemPrompt || '(empty prompt)'}</pre>
			</div>
		</details>
	{/each}

	<ol class="flex flex-col gap-3">
		{#each data.messages as message (message.seq)}
			<li
				class="rounded-box p-3 shadow-sm {message.role === 'user'
					? 'bg-slate-800 text-white ml-8'
					: 'bg-base-100 mr-8'}"
			>
				<div class="flex items-center gap-2 text-xs opacity-70 mb-1">
					<b>{message.role === 'user' ? 'Visitor' : 'Bot'}</b>
					<span>{formatDate(message.createdAt)}</span>
					{#if message.role === 'assistant'}
						<span>· prompt {message.configId === null ? 'defaults' : `#${message.configId}`}</span>
					{/if}
				</div>
				<!-- Visitor and model text is untrusted, so it is shown as text, never as HTML. -->
				<p class="whitespace-pre-wrap break-words text-sm">{message.content}</p>
			</li>
		{/each}
	</ol>
</div>
