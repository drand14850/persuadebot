import { writable, type Writable } from 'svelte/store';

export const apiKeyEncrypted: Writable<string> = writable("PROVIDE_ENCRYPTED_API_KEY_HERE");
