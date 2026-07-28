<script setup>
import { useStudioStore } from "../../stores/studio.js";

const studio = useStudioStore();
</script>

<template>
    <Transition name="dialog">
        <div v-if="studio.dialogs.workspaceGroup" class="dialog-backdrop">
            <section class="dialog-panel" role="dialog" aria-modal="true">
                <h2>{{ studio.dialogForms.editingWorkspaceGroup ? "修改分组" : "创建分组" }}</h2>
                <div class="workspace-alias-form">
                    <label class="remote-workspace-field">
                        <span>分组名称</span>
                        <input
                            v-model="studio.dialogForms.workspaceGroupName"
                            maxlength="40"
                            autocomplete="off"
                            placeholder="例如：公司项目" />
                    </label>
                </div>
                <div class="dialog-actions">
                    <button class="dialog-btn" type="button" @click="studio.dialogs.workspaceGroup = false">
                        取消
                    </button>
                    <button
                        class="dialog-btn primary"
                        type="button"
                        :disabled="!studio.dialogForms.workspaceGroupName.trim()"
                        @click="studio.saveWorkspaceGroup">
                        {{ studio.dialogForms.editingWorkspaceGroup ? "保存" : "创建" }}
                    </button>
                </div>
            </section>
        </div>
    </Transition>
</template>
