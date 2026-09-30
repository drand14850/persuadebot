<script lang="ts">
	import { page } from '$app/stores';

	$: path = $page.url.pathname;
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-base-200">
	<header class="bg-base-100 shadow-sm">
		<div class="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center gap-2">
			<a href="/admin" class="font-semibold text-lg mr-4">Chatbot admin</a>
			<nav class="flex flex-wrap gap-1 flex-1">
				<a href="/admin" class="btn btn-ghost btn-sm" class:btn-active={path === '/admin'}>
					Bot settings
				</a>
				<a
					href="/admin/transcripts"
					class="btn btn-ghost btn-sm"
					class:btn-active={path.startsWith('/admin/transcripts')}
				>
					Transcripts
				</a>
				<a href="/" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">Open chat ↗</a>
			</nav>
			<form method="POST" action="/admin/logout">
				<button class="btn btn-ghost btn-sm">Log out</button>
			</form>
		</div>
	</header>

	<main class="max-w-6xl mx-auto p-4 md:p-6">
		<slot />
	</main>
</div>
