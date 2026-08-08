<script setup>
import { computed, reactive, watch } from 'vue';
import { isValidWebPageUrl } from '../../assets/js/url.js';
import { useI18n } from '../../i18n/index.js';
import { useStudioStore } from '../../stores/studio.js';

const studio = useStudioStore();
const { t } = useI18n();
const touched = reactive({ name: false, url: false });
const nameError = computed(() => (studio.dialogForms.remoteName.trim() ? '' : t('dialog.nameRequired')));
const urlError = computed(() => {
  if (!studio.dialogForms.remoteUrl.trim()) return t('dialog.urlRequired');
  return isValidWebPageUrl(studio.dialogForms.remoteUrl) ? '' : t('dialog.urlInvalid');
});
const invalid = computed(() => Boolean(nameError.value || urlError.value));

watch(
  () => studio.dialogs.remote,
  (open) => {
    if (open) Object.assign(touched, { name: false, url: false });
  },
);
</script>

<template>
  <Transition name="dialog">
    <div v-if="studio.dialogs.remote" class="dialog-backdrop">
      <section class="dialog-panel remote-workspace-panel" role="dialog" aria-modal="true">
        <h2>{{ t(studio.dialogForms.editingRemote ? 'dialog.workspaceEdit' : 'dialog.remoteAdd') }}</h2>
        <form class="remote-workspace-form" @submit.prevent>
          <label class="remote-workspace-field required-field">
            <span>{{ t('dialog.workspaceName') }}</span>
            <input
              v-model="studio.dialogForms.remoteName"
              maxlength="60"
              required
              autocomplete="off"
              :aria-invalid="touched.name && Boolean(nameError)"
              aria-describedby="remote-name-error"
              @blur="touched.name = true"
              :placeholder="t('dialog.nameExample')"
            />
            <small v-if="touched.name && nameError" id="remote-name-error" class="dialog-field-error">
              {{ nameError }}
            </small>
          </label>
          <label class="remote-workspace-field required-field">
            <span>{{ t('dialog.serverUrl') }}</span>
            <input
              v-model="studio.dialogForms.remoteUrl"
              type="url"
              required
              autocomplete="url"
              :aria-invalid="touched.url && Boolean(urlError)"
              aria-describedby="remote-url-error"
              @blur="touched.url = true"
              :placeholder="t('dialog.urlExample')"
            />
            <small v-if="touched.url && urlError" id="remote-url-error" class="dialog-field-error">
              {{ urlError }}
            </small>
          </label>
          <label class="remote-workspace-field">
            <span>{{ t('dialog.usernameOptional') }}</span>
            <input
              v-model="studio.dialogForms.remoteUsername"
              autocomplete="username"
              :placeholder="t('dialog.basicAuth')"
            />
          </label>
          <label class="remote-workspace-field">
            <span>{{ t('dialog.passwordOptional') }}</span>
            <input
              v-model="studio.dialogForms.remotePassword"
              type="password"
              autocomplete="current-password"
              :placeholder="t('dialog.basicAuth')"
            />
          </label>
        </form>
        <div class="dialog-actions">
          <button class="dialog-btn" type="button" @click="studio.dialogs.remote = false">
            {{ t('common.cancel') }}
          </button>
          <button class="dialog-btn primary" type="button" :disabled="invalid" @click="studio.saveRemote">
            {{ t(studio.dialogForms.editingRemote ? 'common.save' : 'common.add') }}
          </button>
        </div>
      </section>
    </div>
  </Transition>
</template>
