<script setup>
import { computed } from "vue";
import { useStudioStore } from "../../stores/studio.js";

const studio = useStudioStore();
const invalid = computed(
    () =>
        !studio.workspaceGroups.value.some((group) => group.id === studio.dialogForms.workspaceMoveGroupId) ||
        studio.dialogForms.workspaceMoveGroupId === studio.dialogForms.workspaceMoveSourceGroupId
);
</script>

<template>
    <Transition name="dialog">
        <div v-if="studio.dialogs.workspaceMove" class="dialog-backdrop">
            <section class="dialog-panel" role="dialog" aria-modal="true">
                <h2>移动分组</h2>
                <label class="remote-workspace-field">
                    <span>目标分组</span>
                    <select v-model="studio.dialogForms.workspaceMoveGroupId">
                        <option v-for="group in studio.workspaceGroups.value" :key="group.id" :value="group.id">
                            {{ group.name }}
                        </option>
                    </select>
                    <small v-if="invalid" class="dialog-field-error">请选择其他分组</small>
                </label>
                <div class="dialog-actions">
                    <button class="dialog-btn" type="button" @click="studio.dialogs.workspaceMove = false">取消</button>
                    <button
                        class="dialog-btn primary"
                        type="button"
                        :disabled="invalid"
                        @click="studio.moveWorkspaceToGroup">
                        确定
                    </button>
                </div>
            </section>
        </div>
    </Transition>
</template>
