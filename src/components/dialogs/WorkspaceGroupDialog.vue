<script setup>
import { computed, ref, watch } from "vue";
import { useI18n } from "../../i18n/index.js";
import { useStudioStore } from "../../stores/studio.js";

const studio = useStudioStore();
const { t } = useI18n();
const touched = ref(false);
const nameError = computed(() => (studio.dialogForms.workspaceGroupName.trim() ? "" : t("dialog.groupRequired")));

watch(
    () => studio.dialogs.workspaceGroup,
    (open) => {
        if (open) touched.value = false;
    }
);
</script>

<template>
    <Transition name="dialog">
        <div v-if="studio.dialogs.workspaceGroup" class="dialog-backdrop">
            <section class="dialog-panel" role="dialog" aria-modal="true">
                <h2>{{ t(studio.dialogForms.editingWorkspaceGroup ? "dialog.groupEdit" : "dialog.groupCreate") }}</h2>
                <div class="workspace-alias-form">
                    <label class="remote-workspace-field required-field">
                        <span>{{ t("dialog.groupName") }}</span>
                        <input
                            v-model="studio.dialogForms.workspaceGroupName"
                            maxlength="40"
                            required
                            autocomplete="off"
                            :aria-invalid="touched && Boolean(nameError)"
                            aria-describedby="workspace-group-name-error"
                            @blur="touched = true"
                            :placeholder="t('dialog.groupExample')" />
                        <small v-if="touched && nameError" id="workspace-group-name-error" class="dialog-field-error">
                            {{ nameError }}
                        </small>
                    </label>
                </div>
                <div class="dialog-actions">
                    <button class="dialog-btn" type="button" @click="studio.dialogs.workspaceGroup = false">
                        {{ t("common.cancel") }}
                    </button>
                    <button
                        class="dialog-btn primary"
                        type="button"
                        :disabled="Boolean(nameError)"
                        @click="studio.saveWorkspaceGroup">
                        {{ t(studio.dialogForms.editingWorkspaceGroup ? "common.save" : "common.create") }}
                    </button>
                </div>
            </section>
        </div>
    </Transition>
</template>
