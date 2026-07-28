<script setup>
import { useStudioStore } from "../../stores/studio.js";

const studio = useStudioStore();
</script>

<template>
    <Transition name="dialog">
        <div v-if="studio.dialogs.remote" class="dialog-backdrop">
            <section class="dialog-panel remote-workspace-panel" role="dialog" aria-modal="true">
                <h2>{{ studio.dialogForms.editingRemote ? "修改工作区信息" : "添加远程工作区" }}</h2>
                <form class="remote-workspace-form" @submit.prevent>
                    <label class="remote-workspace-field">
                        <span>工作区名称</span>
                        <input
                            v-model="studio.dialogForms.remoteName"
                            maxlength="60"
                            autocomplete="off"
                            placeholder="例如：我的云端服务器" />
                    </label>
                    <label class="remote-workspace-field">
                        <span>服务器 URL</span>
                        <input
                            v-model="studio.dialogForms.remoteUrl"
                            type="url"
                            autocomplete="url"
                            placeholder="例如：https://example.com" />
                    </label>
                    <label class="remote-workspace-field">
                        <span>用户名（可选）</span>
                        <input
                            v-model="studio.dialogForms.remoteUsername"
                            autocomplete="username"
                            placeholder="用于 HTTP Basic Auth" />
                    </label>
                    <label class="remote-workspace-field">
                        <span>密码（可选）</span>
                        <input
                            v-model="studio.dialogForms.remotePassword"
                            type="password"
                            autocomplete="current-password"
                            placeholder="用于 HTTP Basic Auth" />
                    </label>
                </form>
                <div class="dialog-actions">
                    <button class="dialog-btn" type="button" @click="studio.dialogs.remote = false">取消</button>
                    <button
                        class="dialog-btn primary"
                        type="button"
                        :disabled="!studio.dialogForms.remoteName.trim() || !studio.dialogForms.remoteUrl.trim()"
                        @click="studio.saveRemote">
                        {{ studio.dialogForms.editingRemote ? "保存" : "添加" }}
                    </button>
                </div>
            </section>
        </div>
    </Transition>
</template>
