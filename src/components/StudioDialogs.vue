<script setup>
import { reactive, watch } from "vue";
import { DEFAULT_TERMINAL_SETTINGS } from "../assets/js/constants.js";
import { useStudioStore } from "../stores/studio.js";
import AppIcon from "./AppIcon.vue";
const studio = useStudioStore();
const promptForm = reactive({ checked: false, behavior: "quit" });
const terminalForm = reactive({ ...studio.state.terminalSettings });
watch(
    () => studio.activePrompt.value,
    (prompt) => {
        promptForm.checked = Boolean(prompt?.checkbox?.checked);
        promptForm.behavior = prompt?.closeBehavior?.selected || "quit";
    }
);
watch(
    () => studio.dialogs.terminalSettings,
    (open) => {
        if (open) Object.assign(terminalForm, studio.state.terminalSettings);
    }
);
function saveTerminal() {
    studio.saveTerminalSettings(terminalForm);
    studio.dialogs.terminalSettings = false;
}

function resetTerminal() {
    Object.assign(terminalForm, DEFAULT_TERMINAL_SETTINGS);
}
</script>

<template>
    <Transition name="dialog">
        <div v-if="studio.activePrompt.value" class="dialog-backdrop">
            <section
                class="dialog-panel prompt-dialog-panel"
                :class="{ 'close-behavior-dialog': studio.activePrompt.value.closeBehavior }"
                role="dialog"
                aria-modal="true">
                <div>
                    <h2>{{ studio.activePrompt.value.title }}</h2>
                    <p>{{ studio.activePrompt.value.message }}</p>
                    <div v-if="studio.activePrompt.value.closeBehavior" class="close-behavior-options">
                        <label
                            v-for="option in studio.activePrompt.value.closeBehavior.options"
                            :key="option.value"
                            class="close-behavior-option">
                            <input v-model="promptForm.behavior" type="radio" :value="option.value" />
                            <span>{{ option.label }}</span>
                        </label>
                    </div>
                </div>
                <div class="dialog-actions" :class="{ 'has-checkbox': studio.activePrompt.value.checkbox }">
                    <label v-if="studio.activePrompt.value.checkbox" class="dialog-checkbox">
                        <input v-model="promptForm.checked" type="checkbox" />
                        <span>{{ studio.activePrompt.value.checkbox.label }}</span>
                    </label>
                    <button
                        v-for="action in studio.activePrompt.value.actions"
                        :key="action.label"
                        class="dialog-btn"
                        :class="{ primary: action.primary, danger: action.danger }"
                        type="button"
                        @click="action.handler({ checked: promptForm.checked, behavior: promptForm.behavior })">
                        {{ action.label }}
                    </button>
                </div>
            </section>
        </div>
    </Transition>
    <Transition name="dialog">
        <div v-if="studio.dialogs.alias" class="dialog-backdrop">
            <section class="dialog-panel" role="dialog">
                <h2>修改工作区信息</h2>
                <div class="workspace-alias-form">
                    <input v-model="studio.dialogForms.alias" class="workspace-alias-input" maxlength="60" />
                </div>
                <div class="dialog-actions">
                    <button class="dialog-btn" type="button" @click="studio.dialogs.alias = false">取消</button>
                    <button class="dialog-btn primary" type="button" @click="studio.saveAlias">保存</button>
                </div>
            </section>
        </div>
    </Transition>
    <Transition name="dialog">
        <div v-if="studio.dialogs.remote" class="dialog-backdrop">
            <section class="dialog-panel remote-workspace-panel" role="dialog">
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
    <Transition name="dialog">
        <div v-if="studio.dialogs.logs" class="dialog-backdrop">
            <section class="dialog-panel log-dialog-panel" role="dialog">
                <div class="log-header">
                    <h2>运行日志</h2>
                    <div class="log-toolbar">
                        <button class="log-clear" type="button" @click="studio.clearLog">清除</button>
                        <button class="dialog-close" type="button" @click="studio.dialogs.logs = false">
                            <AppIcon name="close" />
                        </button>
                    </div>
                </div>
                <div class="log-content">
                    <div v-if="!studio.selectedLogs.value.length" class="log-empty">当前工作区还没有运行日志。</div>
                    <section v-else class="log-group">
                        <div
                            v-for="(line, index) in studio.selectedLogs.value"
                            :key="index"
                            class="log-line"
                            :class="{
                                'log-error': line.startsWith('❌'),
                                'log-success': line.startsWith('✅'),
                                'log-info': line.startsWith('📁')
                            }">
                            {{ line }}
                        </div>
                    </section>
                </div>
            </section>
        </div>
    </Transition>
    <Transition name="dialog">
        <div v-if="studio.dialogs.terminalSettings" class="dialog-backdrop">
            <section class="dialog-panel terminal-settings-panel" role="dialog">
                <h2>终端设置</h2>
                <form class="terminal-settings-form" @submit.prevent>
                    <label class="terminal-settings-field terminal-settings-field-wide">
                        <span>字体</span>
                        <input v-model="terminalForm.fontFamily" />
                    </label>
                    <label class="terminal-settings-field">
                        <span>字号</span>
                        <input v-model.number="terminalForm.fontSize" type="number" min="10" max="24" />
                    </label>
                    <label class="terminal-settings-field">
                        <span>行高</span>
                        <input v-model.number="terminalForm.lineHeight" type="number" min="1" max="2" step="0.05" />
                    </label>
                    <label
                        v-for="field in ['background', 'foreground', 'cursor']"
                        :key="field"
                        class="terminal-settings-field color-field">
                        <span>{{ { background: "背景色", foreground: "文字色", cursor: "光标色" }[field] }}</span>
                        <input v-model="terminalForm[field]" type="color" />
                    </label>
                </form>
                <div class="dialog-actions">
                    <button class="dialog-btn" type="button" @click="resetTerminal">恢复默认</button>
                    <button class="dialog-btn" type="button" @click="studio.dialogs.terminalSettings = false">
                        取消
                    </button>
                    <button class="dialog-btn primary" type="button" @click="saveTerminal">保存</button>
                </div>
            </section>
        </div>
    </Transition>
</template>
