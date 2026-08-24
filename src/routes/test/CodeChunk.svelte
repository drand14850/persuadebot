<script lang="ts">
	import { javascript } from "@codemirror/lang-javascript";
	import { oneDark } from "@codemirror/theme-one-dark";
	import beautify from "js-beautify";
	import CodeMirror from "svelte-codemirror-editor";
	import RunButtons from "./RunButtons.svelte";
	import { apiKeyEncrypted } from "./stores";
	import type { TestCase } from "./tests";
	import { generateDivId, insertApiKeyEncrypted } from "./utils";

	export let testCase: TestCase;
	export let testCaseString: string;

	let updatedValue = testCaseString;

	function fixTitle(str: string): string {
		return "testCase_" + str.replace(/\s/g, "_").toLowerCase();
	}

	function getApiKeyEncryptedFromString(str: string): string {
		const regex = /apiKeyEncrypted: "([^"]*)"/;
		const match = str.match(regex);
		if (match) {
			return match[1];
		}
		return "";
	}

	function replaceApiKeyEncrypted(
		str: string,
		apiKeyEncrypted: string,
	): string {
		const regex = /apiKeyEncrypted: "([^"]*)"/;
		const match = str.match(regex);
		if (match) {
			return str.replace(match[1], apiKeyEncrypted);
		}
		return str;
	}

	let title = fixTitle(testCase.title);
	let storedValue = localStorage.getItem(title);
	if (storedValue) {
		updatedValue = beautify.js(storedValue);
		console.log("Found in local storage\n", updatedValue);
	} else {
		updatedValue = beautify.js(
			insertApiKeyEncrypted(testCaseString, $apiKeyEncrypted),
			{ indent_size: 2 },
		);
	}
</script>

<div class="divider mt-8">
	<button
		class="font-bold"
		on:click={() => {
			updatedValue = beautify.js(
				insertApiKeyEncrypted(testCaseString, $apiKeyEncrypted),
				{ indent_size: 2 },
			);
			localStorage.setItem(title, updatedValue);
		}}>{@html testCase.title}</button
	>
</div>

<div id={generateDivId(testCase.title)}>
	<div class="pb-1">{@html testCase.desc}</div>

	<CodeMirror
		bind:value={updatedValue}
		lang={javascript()}
		tabSize={2}
		useTab={true}
		basic={true}
		theme={oneDark}
		on:change={() => {
			apiKeyEncrypted.set(getApiKeyEncryptedFromString(updatedValue));
			if ($apiKeyEncrypted === "") {
				apiKeyEncrypted.set("PROVIDE_API_KEY_ENCRYPTED_HERE");
			}
			updatedValue = beautify.js(
				replaceApiKeyEncrypted(updatedValue, $apiKeyEncrypted),
				{ indent_size: 2 },
			);
			if (updatedValue === "") {
				updatedValue = beautify.js(testCaseString);
				localStorage.removeItem(title);
			} else {
				localStorage.setItem(title, updatedValue);
			}
		}}
	/>

	<RunButtons testCaseString={updatedValue} />
</div>
