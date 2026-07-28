<script setup>
import { useStudioStore } from "../../stores/studio.js";

const studio = useStudioStore();
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
                            placeholder="例如：开发工程项目" />
                    </label>
                </div>
                <div class="dialog-actions">
                    <button class="dialog-btn" type="button" @click="studio.dialogs.alias = false">取消</button>
                    <button class="dialog-btn primary" type="button" @click="studio.saveAlias">保存</button>
                </div>
            </section>
        </div>
    </Transition>
</template>
