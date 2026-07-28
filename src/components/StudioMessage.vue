<script setup>
import { useStudioStore } from "../stores/studio.js";
import AppIcon from "./AppIcon.vue";

const studio = useStudioStore();
</script>

<template>
    <div class="studio-message-region" aria-live="polite" aria-atomic="false">
        <TransitionGroup name="studio-message">
            <div
                v-for="message in studio.state.messages"
                :key="message.id"
                class="studio-message-item"
                :class="`studio-message-${message.type}`"
                role="status">
                <AppIcon :name="message.type" />
                <span class="studio-message-text">{{ message.text }}</span>
                <button
                    class="studio-message-close"
                    type="button"
                    title="关闭提示"
                    aria-label="关闭提示"
                    @click="studio.closeMessage(message.id)">
                    <AppIcon name="close" />
                </button>
            </div>
        </TransitionGroup>
    </div>
</template>
