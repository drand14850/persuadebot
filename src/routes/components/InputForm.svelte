<script lang="ts">
    import { chatParams } from "$lib/chatParams";
    import {
        messageDisplaySetting,
        messageInfo,
        messages,
        userInput,
    } from "$lib/messages";
    import { isLoading } from "$lib/stores";
    import DOMPurify from "isomorphic-dompurify";
    import {
        checkAtBottom,
        continueScroll,
        countMessagesAndTime,
        disableInputElement,
        enableSubmit,
        getScrollElement,
        inputElementOpacity,
        isAtBottom,
        scrolledUponSubmit,
        handleChatInteraction,
        timeStart,
        userSentMessage,
    } from "../utils";
    import right from "$lib/icons/right.svg";
    import octagonXStop from "$lib/icons/octagon-x-stop.svg";

    export let scrollElement: HTMLDivElement;
    export let nextSection: boolean;

    const submit = async (e: Event) => {
        if ($chatParams.study.sanitize) {
            userInput.set(DOMPurify.sanitize($userInput));
        }
        if ($userInput.trim() === "") {
            return;
        }
        e.preventDefault();
        scrolledUponSubmit.set(true); // to trigger scroll to bottom upon submit

        // determine if the user has sent at least one message and record the time
        if (!$userSentMessage) {
            userSentMessage.set(true);
            timeStart.set(new Date().getTime());
        }

        scrollElement = getScrollElement(scrollElement);
        isAtBottom.set(checkAtBottom(scrollElement));
        isLoading.set(true);
        continueScroll.set(true);

        messageDisplaySetting.update((x) => {
            return { ...x, nWords: 0 };
        });

        if ($chatParams.ui.stream) {
            let messageDisplayStartTime: number = new Date().getTime();
            messageDisplaySetting.update((x) => {
                return { ...x, messageDisplayStartTime };
            });
        }

        countMessagesAndTime($messages);
        handleChatInteraction($userInput, scrollElement, nextSection);
        $userInput = "";

        isAtBottom.set(checkAtBottom(scrollElement));
    };

    const stopRequest = (e: Event) => {
        e.preventDefault();
        isLoading.set(false);
        messageDisplaySetting.update((x) => {
            return { ...x, doneReading: true };
        });
        enableSubmit.set(false);
    };

    const preventPaste = (e: Event) => {
        if ($chatParams.ui.preventPaste) {
            e.preventDefault();
        }
    };
</script>

<form on:submit|preventDefault={submit}>
    <div class="join flex justify-center pt-2">
        {#if $messageInfo.nUserMessages >= $chatParams.study.allowStopAfterNUserMessages || $chatParams.study.allowStopAfterNUserMessages === 0}
            <button
                type="button"
                on:click|preventDefault={stopRequest}
                class="btn bg-red-500 text-white mr-1"
            >
                {#if $chatParams.appearance.endButtonType === "icon"}
                    <!-- show stop button -->
                    <img
                        src={octagonXStop}
                        alt="Stop"
                        class="w-6 h-6 invert brightness-0"
                    />
                {:else}
                    <!-- show text End Conversation if screen width is at least 500px, otherwise show text End -->
                    <span class="hidden min-[500px]:inline"
                        >End Conversation</span
                    >
                    <span class="inline min-[500px]:hidden">End</span>
                {/if}
            </button>
        {/if}
        <input
            class={`input input-bordered rounded-lg w-full ${$inputElementOpacity}`}
            placeholder={$chatParams.appearance.placeHolderInputText}
            maxlength="4000"
            disabled={$disableInputElement}
            bind:value={$userInput}
            on:paste={preventPaste}
        />
        {#if $isAtBottom && !$isLoading}
            <button class="btn rounded-lg bg-[#6569d4] ml-0.5" type="submit"
                ><img
                    src={right}
                    alt="Send"
                    class="w-5 h-5 invert brightness-0"
                /></button
            >
        {/if}
    </div>
</form>
