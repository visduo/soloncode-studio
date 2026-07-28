<script setup>
import { computed, ref, watch } from "vue";
import { useStudioStore } from "../../stores/studio.js";

const studio = useStudioStore();
const touched = ref(false);
const nameError = computed(() => (studio.dialogForms.workspaceGroupName.trim() ? "" : "请输入分组名称"));

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
                <h2>{{ studio.dialogForms.editingWorkspaceGroup ? "修改分组" : "创建分组" }}</h2>
                <div class="workspace-alias-form">
                    <label class="remote-workspace-field">
                        <span>分组名称</span>
                        <input
                            v-model="studio.dialogForms.workspaceGroupName"
                            maxlength="40"
                            required
                            autocomplete="off"
                            :aria-invalid="touched && Boolean(nameError)"
                            aria-describedby="workspace-group-name-error"
                            @blur="touched = true"
                            placeholder="例如：公司项目" />
                        <small v-if="touched && nameError" id="workspace-group-name-error" class="dialog-field-error">
                            {{ nameError }}
                        </small>
                    </label>
                </div>
                <div class="dialog-actions">
                    <button class="dialog-btn" type="button" @click="studio.dialogs.workspaceGroup = false">
                        取消
                    </button>
                    <button
                        class="dialog-btn primary"
                        type="button"
                        :disabled="Boolean(nameError)"
                        @click="studio.saveWorkspaceGroup">
                        {{ studio.dialogForms.editingWorkspaceGroup ? "保存" : "创建" }}
                    </button>
                </div>
            </section>
        </div>
    </Transition>
</template>
