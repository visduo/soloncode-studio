<script setup>
import { useI18n } from '../i18n/index.js';
import { useStudioStore } from '../stores/studio.js';
import AppIcon from './AppIcon.vue';

const studio = useStudioStore();
const { t } = useI18n();
</script>

<template>
  <div class="studio-message-region" aria-live="polite" aria-atomic="false">
    <TransitionGroup name="studio-message">
      <div
        v-for="message in studio.state.messages"
        :key="message.id"
        class="studio-message-item"
        :class="`studio-message-${message.type}`"
        role="status"
      >
        <AppIcon :name="message.type" />
        <span class="studio-message-text">{{ message.text }}</span>
        <button
          class="studio-message-close"
          type="button"
          :title="t('dialog.dismissMessage')"
          :aria-label="t('dialog.dismissMessage')"
          @click="studio.closeMessage(message.id)"
        >
          <AppIcon name="close" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
