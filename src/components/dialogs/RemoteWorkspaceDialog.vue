<script setup>
import { computed, reactive, watch } from "vue";
import { isValidWebPageUrl } from "../../assets/js/url.js";
import { useStudioStore } from "../../stores/studio.js";

const studio = useStudioStore();
const touched = reactive({ name: false, url: false });
const nameError = computed(() => (studio.dialogForms.remoteName.trim() ? "" : "请输入工作区名称"));
const urlError = computed(() => {
    if (!studio.dialogForms.remoteUrl.trim()) return "请输入服务器 URL";
    return isValidWebPageUrl(studio.dialogForms.remoteUrl) ? "" : "请输入有效的 HTTP 或 HTTPS 地址";
});
const invalid = computed(() => Boolean(nameError.value || urlError.value));

watch(
    () => studio.dialogs.remote,
    (open) => {
        if (open) Object.assign(touched, { name: false, url: false });
    }
);
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
                            required
                            autocomplete="off"
                            :aria-invalid="touched.name && Boolean(nameError)"
                            aria-describedby="remote-name-error"
                            @blur="touched.name = true"
                            placeholder="例如：我的云端服务器" />
                        <small v-if="touched.name && nameError" id="remote-name-error" class="dialog-field-error">
                            {{ nameError }}
                        </small>
                    </label>
                    <label class="remote-workspace-field">
                        <span>服务器 URL</span>
                        <input
                            v-model="studio.dialogForms.remoteUrl"
                            type="url"
                            required
                            autocomplete="url"
                            :aria-invalid="touched.url && Boolean(urlError)"
                            aria-describedby="remote-url-error"
                            @blur="touched.url = true"
                            placeholder="例如：https://example.com" />
                        <small v-if="touched.url && urlError" id="remote-url-error" class="dialog-field-error">
                            {{ urlError }}
                        </small>
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
                    <button class="dialog-btn primary" type="button" :disabled="invalid" @click="studio.saveRemote">
                        {{ studio.dialogForms.editingRemote ? "保存" : "添加" }}
                    </button>
                </div>
            </section>
        </div>
    </Transition>
</template>
