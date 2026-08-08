<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from '../../i18n/index.js';
import { useStudioStore } from '../../stores/studio.js';

const studio = useStudioStore();
const { t } = useI18n();
const touched = ref(false);
const nameError = computed(() => (studio.dialogForms.alias.trim() ? '' : t('dialog.nameRequired')));

watch(
  () => studio.dialogs.alias,
  (open) => {
    if (open) touched.value = false;
  },
);
</script>

<template>
  <Transition name="dialog">
    <div v-if="studio.dialogs.alias" class="dialog-backdrop">
      <section class="dialog-panel" role="dialog" aria-modal="true">
        <h2>{{ t('dialog.workspaceEdit') }}</h2>
        <div class="workspace-alias-form">
          <label class="remote-workspace-field required-field">
            <span>{{ t('dialog.workspaceName') }}</span>
            <input
              v-model="studio.dialogForms.alias"
              class="workspace-alias-input"
              maxlength="60"
              required
              :aria-invalid="touched && Boolean(nameError)"
              aria-describedby="workspace-name-error"
              @blur="touched = true"
              :placeholder="t('dialog.aliasExample')"
            />
            <small v-if="touched && nameError" id="workspace-name-error" class="dialog-field-error">
              {{ nameError }}
            </small>
          </label>
        </div>
        <div class="dialog-actions">
          <button class="dialog-btn" type="button" @click="studio.dialogs.alias = false">
            {{ t('common.cancel') }}
          </button>
          <button class="dialog-btn primary" type="button" :disabled="Boolean(nameError)" @click="studio.saveAlias">
            {{ t('common.save') }}
          </button>
        </div>
      </section>
    </div>
  </Transition>
</template>
