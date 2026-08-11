<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from '../../i18n/index.js';
import { useStudioStore } from '../../stores/studio.js';

const studio = useStudioStore();
const { t } = useI18n();
const usernameInput = ref(null);
const invalid = computed(
  () =>
    !studio.dialogForms.httpAuthUsername.trim() ||
    !studio.dialogForms.httpAuthPassword ||
    studio.dialogForms.httpAuthChecking,
);

watch(
  () => studio.dialogs.httpAuth,
  async (open) => {
    if (!open) return;
    await nextTick();
    usernameInput.value?.focus();
  },
);
</script>

<template>
  <Transition name="dialog">
    <div v-if="studio.dialogs.httpAuth" class="dialog-backdrop">
      <section class="dialog-panel remote-workspace-panel" role="dialog" aria-modal="true">
        <div>
          <h2>{{ t('dialog.httpAuthTitle') }}</h2>
          <p>{{ t('dialog.httpAuthMessage', { host: studio.dialogForms.httpAuthHost }) }}</p>
        </div>
        <form class="remote-workspace-form" @submit.prevent="studio.submitHttpAuth">
          <label class="remote-workspace-field required-field">
            <span>{{ t('dialog.httpAuthUsername') }}</span>
            <input
              ref="usernameInput"
              v-model="studio.dialogForms.httpAuthUsername"
              required
              autocomplete="username"
              :disabled="studio.dialogForms.httpAuthChecking"
            />
          </label>
          <label class="remote-workspace-field required-field">
            <span>{{ t('dialog.httpAuthPassword') }}</span>
            <input
              v-model="studio.dialogForms.httpAuthPassword"
              type="password"
              required
              autocomplete="current-password"
              :disabled="studio.dialogForms.httpAuthChecking"
            />
          </label>
          <small v-if="studio.dialogForms.httpAuthError" class="dialog-field-error" role="alert">
            {{ studio.dialogForms.httpAuthError }}
          </small>
          <div class="dialog-actions">
            <button
              class="dialog-btn"
              type="button"
              :disabled="studio.dialogForms.httpAuthChecking"
              @click="studio.closeHttpAuthDialog"
            >
              {{ t('common.cancel') }}
            </button>
            <button class="dialog-btn primary" type="submit" :disabled="invalid">
              {{ t(studio.dialogForms.httpAuthChecking ? 'dialog.httpAuthChecking' : 'dialog.httpAuthSubmit') }}
            </button>
          </div>
        </form>
      </section>
    </div>
  </Transition>
</template>
