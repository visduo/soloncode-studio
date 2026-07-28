<script setup>
import { reactive, watch } from "vue";
import { DEFAULT_TERMINAL_SETTINGS } from "../../assets/js/constants.js";
import { useStudioStore } from "../../stores/studio.js";

const studio = useStudioStore();
const form = reactive({ ...studio.state.terminalSettings });

watch(
    () => studio.dialogs.terminalSettings,
    (open) => {
        if (open) Object.assign(form, studio.state.terminalSettings);
    }
);

function save() {
    studio.saveTerminalSettings(form);
    studio.dialogs.terminalSettings = false;
}

function reset() {
    Object.assign(form, DEFAULT_TERMINAL_SETTINGS);
}
</script>

<template>
    <Transition name="dialog">
        <div v-if="studio.dialogs.terminalSettings" class="dialog-backdrop">
            <section class="dialog-panel terminal-settings-panel" role="dialog" aria-modal="true">
                <h2>终端设置</h2>
                <form class="terminal-settings-form" @submit.prevent>
                    <label class="terminal-settings-field terminal-settings-field-wide">
                        <span>字体</span>
                        <input v-model="form.fontFamily" />
                    </label>
                    <label class="terminal-settings-field">
                        <span>字号</span>
                        <input v-model.number="form.fontSize" type="number" min="10" max="24" />
                    </label>
                    <label class="terminal-settings-field">
                        <span>行高</span>
                        <input v-model.number="form.lineHeight" type="number" min="1" max="2" step="0.05" />
                    </label>
                    <label
                        v-for="field in ['background', 'foreground', 'cursor']"
                        :key="field"
                        class="terminal-settings-field color-field">
                        <span>{{ { background: "背景色", foreground: "文字色", cursor: "光标色" }[field] }}</span>
                        <input v-model="form[field]" type="color" />
                    </label>
                </form>
                <div class="dialog-actions">
                    <button class="dialog-btn" type="button" @click="reset">恢复默认</button>
                    <button class="dialog-btn" type="button" @click="studio.dialogs.terminalSettings = false">
                        取消
                    </button>
                    <button class="dialog-btn primary" type="button" @click="save">保存</button>
                </div>
            </section>
        </div>
    </Transition>
</template>
