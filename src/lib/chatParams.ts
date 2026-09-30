// We use an `interface` to define the structure of an object and
// then use `const` to create an object that adheres to that structure

// https://cookbook.openai.com/examples/how_to_format_inputs_to_chatgpt_models
// NOTE: for perplexity, all user and assistant messages MUST alternate (not necessary for openai)

import { writable, type Writable } from 'svelte/store';

export interface ChatMessageType {
    id: string;
    content: string;
    hideInitialMessage?: boolean;
    isInitial?: boolean;
    createdAt: Date;
    thumb?: string;
    thumbAt?: Date;
    // Shown to the visitor but never sent back to the model (e.g. "something went wrong").
    isError?: boolean;
    role: 'user' | 'assistant' | 'system';
}

// The model, prompt and API key are not here: they live on the server (see
// $lib/server/botConfig) and are edited at /admin. These are display settings only.

export interface Study {
    maxUserMessages: number;
    maxTime: number;
    allowStopAfterNUserMessages: number;
    showVoteButtons?: boolean;
    allowTextHighlight?: boolean;
    stopKeyword?: string;
    sanitize: boolean;
}

export interface UI {
    stream: boolean;
    streamThrottleRate: number;
    preventPaste: boolean;
    showMessageCount: 'none' | 'total' | 'remain';
    showTimer: "none" | "elapsed" | "remain";
    assistantMessageOnLoad: boolean;
    hideInitialMessages: boolean;
    showSystemMessages: boolean;
    showInputBasedOnReadingTime: boolean;
    avgWordsPerSec: number;
}

export interface Appearance {
    showBotAvatar: boolean;
    bubbleAssistantBackground: string;
    bubbleAssistantTextColor: string;
    bubbleUserBackground: string;
    bubbleUserTextColor: string;
    voteButtonOpacity: string;
    placeHolderInputText: string;
    endButtonType: "text" | "icon";
    endChatText: string;
    notice: string;
    showInputElement: boolean;
    botAvatarUrl: string;
    botAvatarLoadingUrl: string;
    botAvatarLoadedUrl: string;
}

export interface ChatParamsType {
    study: Study;
    initialMessages: ChatMessageType[];
    ui: UI;
    appearance: Appearance;
}

export const chatParams = writable<ChatParamsType>({
    study: {
        maxUserMessages: +Infinity,
        maxTime: +Infinity,
        allowStopAfterNUserMessages: +Infinity,
        showVoteButtons: false,
        allowTextHighlight: false,
        stopKeyword: undefined,
        sanitize: true,
    },
    initialMessages: [],
    ui: {
        // /api/chat always streams
        stream: true,
        streamThrottleRate: 0,
        preventPaste: false,
        showMessageCount: "none",
        showTimer: "none",
        assistantMessageOnLoad: true,
        hideInitialMessages: true,
        showSystemMessages: false,
        showInputBasedOnReadingTime: false,
        avgWordsPerSec: 12
    },
    appearance: {
        showBotAvatar: true,
        bubbleAssistantBackground: 'bg-white',
        bubbleAssistantTextColor: 'text-black',
        bubbleUserBackground: 'bg-slate-800',
        bubbleUserTextColor: 'text-white',
        voteButtonOpacity: "opacity-60",
        placeHolderInputText: "Say something...",
        endButtonType: "text",
        endChatText: "This conversation has ended.",
        notice: "",
        showInputElement: true,
        botAvatarUrl: "",
        botAvatarLoadingUrl: "",
        botAvatarLoadedUrl: "",
    },
});


type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

type UpdateChatParamsType = (updates: DeepPartial<ChatParamsType>) => void;

export const updateChatParams: UpdateChatParamsType = (updates) => {

    let wrongTypes: string[] = [];
    let wrongKeys: string[] = [];

    chatParams.update(current => {
        const stack: [any, any][] = [[current, updates]];
        while (stack.length > 0) {
            const [currentD1, currentD2] = stack.pop()!;
            for (const key in currentD2) {
                if (!currentD1.hasOwnProperty(key)) {
                    const msg = `${key}`;
                    wrongKeys.push(msg);
                    continue;
                }
                if (Array.isArray(currentD2[key]) && Array.isArray(currentD1[key])) {
                    currentD1[key] = currentD2[key];
                    continue;
                };

                if (currentD1[key] !== undefined && (currentD2[key].constructor !== currentD1[key].constructor)) {
                    const msg = `\n- ${key}: expected ${currentD1[key].constructor.name} (default: ${currentD1[key]}); received ${currentD2[key].constructor.name}`;
                    wrongTypes.push(msg);
                    continue;
                }

                if (typeof currentD2[key] === 'object' && currentD2[key] !== null && typeof currentD1[key] === 'object' && currentD1[key] !== null) {
                    stack.push([currentD1[key], currentD2[key]]);
                } else {
                    currentD1[key] = currentD2[key];
                }
            }
        }

        if (wrongKeys.length + wrongTypes.length > 0) {
            let alertMsg = "Error with chat parameters\n\n";
            if (wrongKeys.length > 0) {
                alertMsg += `Invalid (ignored) parameters: ${wrongKeys.join(", ")}`;
            }
            if (wrongTypes.length > 0) {
                if (!alertMsg.endsWith("\n\n")) alertMsg += "\n\n";
                alertMsg += `Invalid types${wrongTypes.join("")}`;
            }
            alert(alertMsg);
            throw new Error("Chat parameters validation failed.");
        }

        return current;
    });
};

