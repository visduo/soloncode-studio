<script setup>
import { computed, ref, watch } from "vue";
import { useStudioStore } from "../../stores/studio.js";

const studio = useStudioStore();
const touched = ref(false);
const nameError = computed(() => (studio.dialogForms.alias.trim() ? "" : "请输入工作区名称"));

watch(
    () => studio.dialogs.alias,
    (open) => {
        if (open) touched.value = false;
    }
);
</script>

<template>
    <Transition name="dialog">
        <div v-if="studio.dialogs.alias" class="dialog-backdrop">
            <section class="dialog-panel" role="dialog" aria-modal="true">
                <h2>修改工作区信息</h2>
                <div class="workspace-alias-form">
                    <label class="remote-workspace-field">
                        <span>工作区名称</span>
                        <input
                            v-model="studio.dialogForms.alias"
                            class="workspace-alias-input"
                            maxlength="60"
                            required
                            :aria-invalid="touched && Boolean(nameError)"
                            aria-describedby="workspace-name-error"
                            @blur="touched = true"
                            placeholder="例如：开发工程项目" />
                        <small v-if="touched && nameError" id="workspace-name-error" class="dialog-field-error">
                            {{ nameError }}
                        </small>
                    </label>
                </div>
                <div class="dialog-actions">
                    <button class="dialog-btn" type="button" @click="studio.dialogs.alias = false">取消</button>
                    <button
                        class="dialog-btn primary"
                        type="button"
                        :disabled="Boolean(nameError)"
                        @click="studio.saveAlias">
                        保存
                    </button>
                </div>
            </section>
        </div>
    </Transition>
</template>
