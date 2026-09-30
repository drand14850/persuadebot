
import type { ChatMessageType, ChatParamsType } from "$lib/chatParams";
import { chatParams, updateChatParams } from "$lib/chatParams";
import { addAIMessage, addEmptyAIMessage, addErrorMessage, addUserMessage, countMessages, getHistoryForServer, initialMessages, messageDisplaySetting, messageInfo, messages, processInitialMessages, removeEmptyAIMessage } from "$lib/messages";
import type { PublicBotConfig } from "$lib/server/botConfig";
import { isLoading } from "$lib/stores";
import { tick } from "svelte";
import { get, writable, type Writable } from "svelte/store";

const ERROR_TEXT = "Sorry, something went wrong on our side. Please try sending your message again.";
const CUT_OFF_NOTE = "\n\n_(The reply was cut off. Please try again.)_";

// Local Utils variables:
export const scrolledUponSubmit: Writable<boolean> = writable(false);
export const lastScrollTop: Writable<number> = writable(0);
// Stores for managing scroll states:
export const continueScroll: Writable<boolean> = writable(true);
export const isAtBottom: Writable<boolean> = writable(false);
export const inputElementOpacity: Writable<string> = writable("opacity-100");
export const disableInputElement: Writable<boolean> = writable(false);
export const enableSubmit: Writable<boolean> = writable(true);
export const timeNow: Writable<number> = writable(new Date().getTime());
// keep track of whether user has sent at least one message
export const userSentMessage: Writable<boolean> = writable(false);
export const timeStart: Writable<number> = writable(0);  // or new Date().getTime()

export const timeReceivedResponse: Writable<number> = writable(0);
export const isLoaded: Writable<boolean> = writable(false);

// One id per page load; the server groups saved transcripts by it. A reload starts over.
let conversationId = "";

function newConversationId(): string {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    // randomUUID needs a secure context; getRandomValues does not.
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}


export function toggleInputElementOpacity(): void {
    if (get(isLoading)) {
        inputElementOpacity.set("opacity-55");
        disableInputElement.set(true);
    } else {
        inputElementOpacity.set("opacity-100");
        disableInputElement.set(false);
    }
}


// Scroll Functions
export function getScrollElement(node: HTMLDivElement | null): HTMLDivElement {
    // scrollElement is null/undefined when the app is first mounted because the element has not been rendered yet (due to isLoaded being updated later in the lifecycle)
    // this function/check is needed to ensure scrollElement is not null/undefined for many functions downstream!!!

    if (!node) {
        node = document.getElementById(
            "scrollElement",
        ) as HTMLDivElement;
    }
    return node;
}

export function checkAtBottom(node: HTMLElement): boolean {
    if (!node) {
        node = getScrollElement(node);
    }
    if (!node) return true;

    // add extra pixels to the scrollHeight to account for rounding errors
    const atBottom = node.scrollTop + node.clientHeight + 10 >= node.scrollHeight;

    // log only for debugging purposes
    const debug = false
    if (debug) {
        console.log(node);
        console.log(`scrollTop: ${node.scrollTop}, clientHeight: ${node.clientHeight}, scrollHeight: ${node.scrollHeight}, scrollTop + scrollHeight: ${node.scrollTop + node.clientHeight}`)
        console.log("atBottom:", atBottom)
    }

    return atBottom;
}

export function handleScroll(e: Event) {
    const node = e.target as HTMLDivElement;
    if (get(isLoading)) {
        // if is loading, scroll should never be considered at bottom, so disable input element
        isAtBottom.set(false);
        toggleInputElementOpacity();
    } else {
        if (checkAtBottom(node)) {
            // if not loading and at bottom, then enable input element
            isAtBottom.set(true);
            toggleInputElementOpacity();
        } else {
            // if not loading but not at bottom, then user has scrolled up, so disable input element
            isAtBottom.set(false);
            inputElementOpacity.set("opacity-55");
            disableInputElement.set(true);
        }
    }
};


// https://svelte.dev/repl/937a3a035a1f41178714cd7e2e21ca7a?version=3.48.0
export const scrollToBottom = async (node: HTMLDivElement) => {
    node = getScrollElement(node);
    node.scroll({ top: node.scrollHeight, behavior: "smooth" });
    // add extra pixels to ensure fully scrolled to bottom
    node.scrollTop = node.scrollTop += 10000;
    isAtBottom.set(true);
};


export const isScrollbarVisible = (node: HTMLDivElement) => {
    node = getScrollElement(node);
    if (node) return node.scrollHeight > node.clientHeight;
};


export const sleep = (seconds: number) => {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
};


export function countTime(): void {
    timeNow.set(new Date().getTime());
    let currentTime: number = get(timeNow);
    const timeElapsed = (currentTime - get(timeStart)) / 1000;
    if (timeElapsed >= get(chatParams).study.maxTime && get(userSentMessage)) {
        enableSubmit.set(false);
    }
}

export async function countTimeElapsed() {
    while (get(enableSubmit)) {
        countTime();
        await sleep(2);  // check every 2 seconds to determine whether to disable submit button
    }
}

export function countMessagesAndTime(messages: ChatMessageType[]): void {
    countMessages(messages);
    countTime();
};


export async function showButtonAfterDelay(stream: boolean = true, messages: ChatMessageType[]): Promise<void> {
    let timeLeft: number;
    let { nWords,
        messageDisplayDuration,
        messageDisplayStartTime,
        avgWordsPerSec,
        avgSecondsPerWord,
        minReadingTime,
        doneReading } = get(messageDisplaySetting);

    if (stream) {
        messageDisplayDuration = (new Date().getTime() - messageDisplayStartTime) / 1000;
        timeLeft = minReadingTime - messageDisplayDuration;
        messageDisplaySetting.update((val) => {
            return { ...val, messageDisplayDuration };
        });
    } else {
        doneReading = false;
        messageDisplaySetting.update((val) => {
            return { ...val, doneReading }
        });
        console.log("$message2", messages);
        nWords = messages[messages.length - 1].content.split(" ").length;
        messageDisplaySetting.update((val) => {
            return { ...val, nWords };
        });
        minReadingTime = avgSecondsPerWord * nWords;
        timeLeft = minReadingTime;
        messageDisplaySetting.update((val) => {
            return { ...val, minReadingTime };
        });
    }
    timeLeft = timeLeft * 1000;
    if (timeLeft < 0) timeLeft = 0;
    console.log(
        `Expected reading time: ${Math.round(minReadingTime * 1000)}ms. Waiting time: ${Math.round(timeLeft)}ms`,
    );
    await tick();
    await new Promise((resolve) => setTimeout(resolve, timeLeft));
    messageDisplaySetting.update((val) => {
        return { ...val, doneReading: true }
    });
    console.log("Expected reading time over");
}


export function handlePostChat(
    allMessages: ChatMessageType[],
    nextSection: boolean,
    scrollElement: HTMLDivElement,
): void {

    if (get(chatParams).ui.showInputBasedOnReadingTime && get(chatParams).ui.stream) {
        showButtonAfterDelay(true, allMessages);
    } else {
        messageDisplaySetting.update((x) => { return { ...x, doneReading: true }; });
    }

    if (checkAtBottom(scrollElement)) {
        isAtBottom.set(true);
    }

    if (get(isAtBottom)) {
        toggleInputElementOpacity();
    }

    countMessagesAndTime(allMessages);
    logMessageTypeCount(allMessages);
}



function logMessageTypeCount(messages: ChatMessageType[]): void {

    const messagesInitial = messages.filter((m) => m.isInitial);
    const nInitial = messagesInitial.length;
    const nInitialSystem = messagesInitial.filter((m) => m.role === "system").length;
    const nInitialAi = messagesInitial.filter((m) => m.role === "assistant").length;
    const nInitialHuman = messagesInitial.filter((m) => m.role === "user").length;

    const messagesSubsequent = messages.filter((m) => !m.isInitial);
    const nSubsequent = messagesSubsequent.length;
    const nSubsequentSystem = messagesSubsequent.filter((m) => m.role === "system").length;
    const nSubsequentAi = messagesSubsequent.filter((m) => m.role === "assistant").length;
    const nSubsequentHuman = messagesSubsequent.filter((m) => m.role === "user").length;

    const outputString = `Messages[${messages.length}]: initial[${nInitial}][${nInitialSystem}s${nInitialAi}a${nInitialHuman}h] subsequent[${nSubsequent}][${nSubsequentSystem}s${nSubsequentAi}a${nSubsequentHuman}h]`;

    console.log(outputString);

}


// Applies the public settings served with the page (see +page.server.ts). The prompt and model
// are not among them: the server adds those to every request itself.
export function initializeChat(bot: PublicBotConfig) {

    conversationId = newConversationId();

    const greeting: ChatMessageType[] = bot.greeting.trim()
        ? [{ role: "assistant", content: bot.greeting, hideInitialMessage: false } as ChatMessageType]
        : [];

    updateChatParams({
        study: {
            // 0 in the admin settings means unlimited
            maxUserMessages: bot.maxUserMessages > 0 ? bot.maxUserMessages : Infinity,
        },
        initialMessages: greeting,
        ui: {
            assistantMessageOnLoad: false,
        },
        appearance: {
            placeHolderInputText: bot.placeholder,
            endChatText: bot.endText,
            notice: bot.notice,
            botAvatarUrl: bot.avatarUrl,
        },
    });

    processInitialMessages();

    messageInfo.update((x) => {
        return {
            ...x,
            nInitialMessages: get(initialMessages).length,
        };
    });

    isLoaded.set(true);
};


type ChatResult = { ok: true; body: ReadableStream<Uint8Array> } | { ok: false; status: number };

async function fetchChatResponse(): Promise<ChatResult> {
    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                conversationId,
                messages: getHistoryForServer(),
            }),
        });
        if (response.ok && response.body) {
            return { ok: true, body: response.body };
        }
        console.error(`Chat request failed (${response.status}): ${await response.text()}`);
        return { ok: false, status: response.status };
    } catch (error) {
        console.error("Chat request failed (network error):", error);
        return { ok: false, status: 0 };
    }
}

export async function handleChatInteraction(
    userInputText: string,
    scrollElement: HTMLDivElement,
    nextSection: boolean
) {
    if (userInputText === "" || userInputText === undefined) return;

    isLoading.set(true);
    addUserMessage(userInputText);
    addEmptyAIMessage();  // to trigger loading avatar

    const result = await fetchChatResponse();
    timeReceivedResponse.set(new Date().getTime());

    if (!result.ok) {
        if (result.status === 429) {
            // Message limit reached on the server (e.g. lowered mid-conversation): end the chat.
            removeEmptyAIMessage();
            enableSubmit.set(false);
        } else {
            addErrorMessage(ERROR_TEXT);
        }
        isLoading.set(false);
    } else {
        const reader = result.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let scrolled = false;
        let streamedText = "";   // store the streamed text to check for stop keyword
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                // stream: true keeps a character split across two chunks from being garbled
                const chunk = decoder.decode(value, { stream: true });
                if (chunk === "") continue;
                streamedText += chunk;
                addAIMessage(chunk, true);
                // throttle stream so it doesn't load too fast for user to read (to avoid skimming)
                await delay(chunk.length * get(chatParams).ui.streamThrottleRate);
                if (scrollElement && !scrolled) {
                    scrollElement.scrollBy(0, 150);
                    scrolled = true;
                }
            }
        } catch (error) {
            console.error("Reply stream interrupted:", error);
            if (streamedText === "") {
                addErrorMessage(ERROR_TEXT);
            } else {
                addAIMessage(CUT_OFF_NOTE, true);
            }
        }
        isLoading.set(false);
        if (checkForStopKeyword(streamedText, get(chatParams))) {
            nextSection = true;
        }
    }

    handlePostChat(get(messages), nextSection, scrollElement);
}

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


function checkForStopKeyword(text: string, chatParams: ChatParamsType): boolean {
    if (chatParams.study.stopKeyword !== undefined && text.includes(chatParams.study.stopKeyword)) {
        enableSubmit.set(false);
        return true;
    }
    return false;
}
