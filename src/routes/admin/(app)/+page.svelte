<script lang="ts">
	import { enhance } from '$app/forms';
	import type { BotConfig } from '$lib/server/botConfig';
	import { formatDate, truncate } from '../format';
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	// The editor's working copy. It only goes live when saved.
	let values: BotConfig = structuredClone(data.current.config);
	let loadedVersion: number | null = null;
	let note = '';
	let saving = false;

	$: dirty = JSON.stringify(values) !== JSON.stringify(data.current.config);
	$: errors = (form?.errors ?? {}) as Partial<Record<keyof BotConfig, string[]>>;
	$: canSave = data.dbMode !== 'none' && !data.dbError;
	$: modelKnown =
		data.models.length === 0 ||
		data.models.some((m) => values.model === m.id || values.model.startsWith(`${m.id}:`));

	function loadVersion(id: number, config: BotConfig) {
		values = structuredClone(config);
		loadedVersion = id;
	}

	function discardChanges() {
		values = structuredClone(data.current.config);
		loadedVersion = null;
	}

	function resetToDefaults() {
		values = structuredClone(data.defaults);
		loadedVersion = null;
	}
</script>

<svelte:head>
	<title>Bot settings · Admin</title>
</svelte:head>

<div class="grid gap-6 lg:grid-cols-[1fr_20rem] items-start">
	<form
		method="POST"
		action="?/save"
		class="flex flex-col gap-6 min-w-0"
		use:enhance={() => {
			saving = true;
			return async ({ result, update }) => {
				await update({ reset: false });
				saving = false;
				if (result.type === 'success') {
					values = structuredClone(data.current.config);
					loadedVersion = null;
					note = '';
				}
			};
		}}
	>
		{#if form?.savedId}
			<div role="status" class="alert alert-success">
				<span>
					Saved as version #{form.savedId}. It's live: the next message anyone sends uses it.
				</span>
			</div>
		{/if}
		{#if form?.saveError}
			<div role="alert" class="alert alert-error"><span>{form.saveError}</span></div>
		{/if}
		{#if loadedVersion !== null}
			<div role="status" class="alert alert-info">
				<span>Version #{loadedVersion} is loaded into the editor. Click <b>Save</b> to make it live.</span>
			</div>
		{/if}

		<section class="card bg-base-100 shadow-sm">
			<div class="card-body gap-3">
				<h2 class="card-title">Prompt</h2>
				<p class="text-sm text-base-content/70">
					Instructions the model follows in every conversation. Visitors never see this text.
				</p>
				<textarea
					name="systemPrompt"
					bind:value={values.systemPrompt}
					rows="16"
					class="textarea textarea-bordered font-mono text-sm leading-relaxed w-full"
					class:textarea-error={errors.systemPrompt}
					placeholder="You are a friendly guide for..."
				></textarea>
				<div class="flex justify-between text-xs text-base-content/60">
					<span>{#if errors.systemPrompt}<span class="text-error">{errors.systemPrompt[0]}</span>{/if}</span>
					<span>{values.systemPrompt.length.toLocaleString()} characters</span>
				</div>
			</div>
		</section>

		<section class="card bg-base-100 shadow-sm">
			<div class="card-body gap-3">
				<h2 class="card-title">Opening message</h2>
				<p class="text-sm text-base-content/70">
					Shown as the bot's first message when someone opens the page. Leave it empty to let the
					visitor speak first. Markdown works (<code>**bold**</code>, links, lists).
				</p>
				<textarea
					name="greeting"
					bind:value={values.greeting}
					rows="3"
					class="textarea textarea-bordered w-full"
					class:textarea-error={errors.greeting}
				></textarea>
				{#if errors.greeting}<p class="text-error text-xs">{errors.greeting[0]}</p>{/if}
			</div>
		</section>

		<section class="card bg-base-100 shadow-sm">
			<div class="card-body gap-4">
				<h2 class="card-title">Model</h2>
				<label class="form-control w-full">
					<span class="label-text mb-1">OpenRouter model id</span>
					<input
						name="model"
						bind:value={values.model}
						list="model-options"
						autocomplete="off"
						spellcheck="false"
						class="input input-bordered w-full font-mono text-sm"
						class:input-error={errors.model}
					/>
					<datalist id="model-options">
						{#each data.models as model}
							<option value={model.id}>{model.label}</option>
						{/each}
					</datalist>
					<span class="text-xs text-base-content/60 mt-1">
						Start typing to pick from OpenRouter's current list (prices are per million tokens), or
						browse <a class="link" href="https://openrouter.ai/models" target="_blank" rel="noopener"
							>openrouter.ai/models</a
						>. Add <code>:online</code> to the end to let the model search the web (costs extra).
					</span>
					{#if errors.model}
						<span class="text-error text-xs mt-1">{errors.model[0]}</span>
					{:else if !modelKnown}
						<span class="text-warning text-xs mt-1">
							This id isn't in OpenRouter's current list. Check the spelling before saving.
						</span>
					{/if}
				</label>

				<div class="grid gap-4 sm:grid-cols-2">
					<label class="form-control">
						<span class="label-text mb-1">Temperature (0–2)</span>
						<input
							name="temperature"
							type="number"
							step="0.05"
							min="0"
							max="2"
							bind:value={values.temperature}
							placeholder="Model default"
							class="input input-bordered"
							class:input-error={errors.temperature}
						/>
						<span class="text-xs text-base-content/60 mt-1">
							Lower is more predictable, higher is more varied. Leave empty for the model's default.
						</span>
						{#if errors.temperature}<span class="text-error text-xs">{errors.temperature[0]}</span>{/if}
					</label>
					<label class="form-control">
						<span class="label-text mb-1">Longest reply (tokens)</span>
						<input
							name="maxTokens"
							type="number"
							min="16"
							max="8000"
							bind:value={values.maxTokens}
							class="input input-bordered"
							class:input-error={errors.maxTokens}
						/>
						<span class="text-xs text-base-content/60 mt-1">
							A token is roughly ¾ of a word. Replies stop at this length.
						</span>
						{#if errors.maxTokens}<span class="text-error text-xs">{errors.maxTokens[0]}</span>{/if}
					</label>
				</div>
			</div>
		</section>

		<section class="card bg-base-100 shadow-sm">
			<div class="card-body gap-4">
				<h2 class="card-title">Limits</h2>
				<div class="grid gap-4 sm:grid-cols-2">
					<label class="form-control">
						<span class="label-text mb-1">Messages per visitor</span>
						<input
							name="maxUserMessages"
							type="number"
							min="0"
							max="1000"
							bind:value={values.maxUserMessages}
							class="input input-bordered"
							class:input-error={errors.maxUserMessages}
						/>
						<span class="text-xs text-base-content/60 mt-1">
							How many messages one visitor can send before the chat ends. 0 means no limit.
						</span>
						{#if errors.maxUserMessages}
							<span class="text-error text-xs">{errors.maxUserMessages[0]}</span>
						{/if}
					</label>
					<label class="form-control">
						<span class="label-text mb-1">Shown when the limit is reached</span>
						<input
							name="endText"
							bind:value={values.endText}
							class="input input-bordered"
							class:input-error={errors.endText}
						/>
						{#if errors.endText}<span class="text-error text-xs">{errors.endText[0]}</span>{/if}
					</label>
				</div>
			</div>
		</section>

		<section class="card bg-base-100 shadow-sm">
			<div class="card-body gap-4">
				<h2 class="card-title">Page</h2>
				<div class="grid gap-4 sm:grid-cols-2">
					<label class="form-control">
						<span class="label-text mb-1">Browser tab title</span>
						<input
							name="title"
							bind:value={values.title}
							class="input input-bordered"
							class:input-error={errors.title}
						/>
						{#if errors.title}<span class="text-error text-xs">{errors.title[0]}</span>{/if}
					</label>
					<label class="form-control">
						<span class="label-text mb-1">Text in the empty message box</span>
						<input
							name="placeholder"
							bind:value={values.placeholder}
							class="input input-bordered"
							class:input-error={errors.placeholder}
						/>
						{#if errors.placeholder}<span class="text-error text-xs">{errors.placeholder[0]}</span>{/if}
					</label>
				</div>
				<label class="form-control">
					<span class="label-text mb-1">Small print under the message box</span>
					<input
						name="notice"
						bind:value={values.notice}
						class="input input-bordered"
						class:input-error={errors.notice}
					/>
					<span class="text-xs text-base-content/60 mt-1">
						Conversations are being recorded, so keep a notice here telling visitors that.
					</span>
					{#if errors.notice}<span class="text-error text-xs">{errors.notice[0]}</span>{/if}
				</label>
				<label class="form-control">
					<span class="label-text mb-1">Bot avatar image URL (optional)</span>
					<input
						name="avatarUrl"
						bind:value={values.avatarUrl}
						placeholder="https://..."
						class="input input-bordered"
						class:input-error={errors.avatarUrl}
					/>
					<span class="text-xs text-base-content/60 mt-1">Leave empty for the default egg icon.</span>
					{#if errors.avatarUrl}<span class="text-error text-xs">{errors.avatarUrl[0]}</span>{/if}
				</label>
			</div>
		</section>

		<div
			class="sticky bottom-0 z-10 bg-base-100 border border-base-300 rounded-box shadow-md p-3 flex flex-wrap items-center gap-2"
		>
			<input
				name="note"
				bind:value={note}
				maxlength="500"
				placeholder="What did you change? (optional)"
				class="input input-bordered input-sm flex-1 min-w-48"
			/>
			{#if dirty}
				<span class="badge badge-warning">Unsaved changes</span>
				<button type="button" class="btn btn-ghost btn-sm" on:click={discardChanges}>Discard</button>
			{/if}
			<button class="btn btn-primary btn-sm" disabled={!canSave || saving}>
				{#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}
				Save
			</button>
		</div>
	</form>

	<aside class="flex flex-col gap-6 lg:sticky lg:top-4">
		<section class="card bg-base-100 shadow-sm">
			<div class="card-body gap-2 text-sm">
				<h2 class="card-title text-base">Status</h2>
				<p>
					{#if data.current.id}
						Live: <b>version #{data.current.id}</b>, saved {formatDate(data.current.savedAt)}
					{:else}
						Live: <b>built-in defaults</b> (nothing saved yet)
					{/if}
				</p>
				<p>
					{#if data.openRouterKeySet}
						<span class="text-success">●</span> OpenRouter key is set
					{:else}
						<span class="text-error">●</span> <b>OPENROUTER_API_KEY is missing.</b> The chat can't reply until
						it's set.
					{/if}
				</p>
				<p>
					{#if data.dbError}
						<span class="text-error">●</span> <b>Database error:</b> {data.dbError}
					{:else if data.dbMode === 'remote'}
						<span class="text-success">●</span> Database connected (Turso)
					{:else if data.dbMode === 'local'}
						<span class="text-success">●</span> Local database file (development only)
					{:else}
						<span class="text-error">●</span> <b>No database.</b> Settings can't be saved and conversations
						aren't recorded. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.
					{/if}
				</p>
			</div>
		</section>

		<section class="card bg-base-100 shadow-sm">
			<div class="card-body gap-2">
				<h2 class="card-title text-base">Version history</h2>
				{#if data.versions.length === 0}
					<p class="text-sm text-base-content/70">Every save appears here so you can go back to it.</p>
				{:else}
					<p class="text-xs text-base-content/60">
						<b>Load</b> copies a version into the editor. Nothing changes until you save.
					</p>
					<ul class="flex flex-col gap-1">
						{#each data.versions as version (version.id)}
							<li
								class="flex items-start gap-2 rounded-lg p-2 text-sm"
								class:bg-base-200={loadedVersion === version.id}
							>
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-1">
										<b>#{version.id}</b>
										{#if version.id === data.current.id}
											<span class="badge badge-success badge-sm">live</span>
										{/if}
										<span class="text-xs text-base-content/60">{formatDate(version.savedAt)}</span>
									</div>
									<div class="text-xs text-base-content/70 break-words">
										{version.note || truncate(version.config.systemPrompt, 70) || '(empty prompt)'}
									</div>
								</div>
								<button
									type="button"
									class="btn btn-ghost btn-xs"
									on:click={() => loadVersion(version.id, version.config)}
								>
									Load
								</button>
							</li>
						{/each}
					</ul>
				{/if}
				<button type="button" class="btn btn-ghost btn-xs self-start mt-2" on:click={resetToDefaults}>
					Load built-in defaults
				</button>
			</div>
		</section>
	</aside>
</div>
