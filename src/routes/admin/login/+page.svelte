<script lang="ts">
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;
</script>

<svelte:head>
	<title>Admin login</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="min-h-screen bg-base-200 flex items-center justify-center p-4">
	<form method="POST" class="card bg-base-100 shadow-md w-full max-w-sm">
		<div class="card-body gap-4">
			<h1 class="card-title">Chatbot admin</h1>

			{#if data.problem}
				<div role="alert" class="alert alert-warning text-sm">
					<span>
						Admin login is switched off: {data.problem} Set it in your hosting provider's environment
						variables (or in <code>.env</code> when running locally), then reload this page.
					</span>
				</div>
			{:else}
				<label class="form-control w-full">
					<span class="label-text mb-1">Password</span>
					<!-- svelte-ignore a11y-autofocus -->
					<input
						type="password"
						name="password"
						autocomplete="current-password"
						class="input input-bordered w-full"
						required
						autofocus
					/>
				</label>

				{#if form?.error}
					<p class="text-error text-sm">{form.error}</p>
				{/if}

				<button class="btn btn-primary w-full">Log in</button>
			{/if}
		</div>
	</form>
</main>
