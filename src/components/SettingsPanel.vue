<script setup>
import { computed, reactive, ref } from "vue";
import { DEFAULT_TERMINAL_SETTINGS } from "../assets/js/constants.js";
import { useStudioStore } from "../stores/studio.js";

const studio = useStudioStore();
const activeSection = ref("preferences");
const form = reactive({ ...studio.state.terminalSettings });
const touched = reactive({ fontFamily: false, fontSize: false, lineHeight: false });
const errors = computed(() => ({
    fontFamily: form.fontFamily.trim() ? "" : "请输入字体名称",
    fontSize: Number.isFinite(form.fontSize) && form.fontSize >= 10 && form.fontSize <= 24 ? "" : "字号应为 10 至 24",
    lineHeight:
        Number.isFinite(form.lineHeight) && form.lineHeight >= 1 && form.lineHeight <= 2 ? "" : "行高应为 1 至 2"
}));
const invalid = computed(() => Object.values(errors.value).some(Boolean));

function selectSection(section) {
    activeSection.value = section;
    if (section === "terminal") {
        Object.assign(form, studio.state.terminalSettings);
        Object.assign(touched, { fontFamily: false, fontSize: false, lineHeight: false });
    }
}

function save() {
    if (invalid.value) return;
    studio.saveTerminalSettings(form);
}

function reset() {
    Object.assign(form, DEFAULT_TERMINAL_SETTINGS);
}
</script>

<template>
    <div class="settings-panel">
        <header class="settings-header">
            <h1>设置</h1>
            <p>管理 SolonCode Studio 的使用偏好。</p>
        </header>

        <nav class="settings-tabs">
            <button
                class="settings-tab"
                :class="{ active: activeSection === 'preferences' }"
                type="button"
                @click="selectSection('preferences')">
                偏好设置
            </button>
            <button
                class="settings-tab"
                :class="{ active: activeSection === 'terminal' }"
                type="button"
                @click="selectSection('terminal')">
                内置终端设置
            </button>
        </nav>

        <section v-if="activeSection === 'preferences'" class="settings-content"></section>
        <section v-else class="settings-content terminal-settings-section">
            <form class="terminal-settings-form" @submit.prevent>
                <label class="terminal-settings-field terminal-settings-field-wide">
                    <span>字体</span>
                    <input
                        v-model="form.fontFamily"
                        required
                        :aria-invalid="touched.fontFamily && Boolean(errors.fontFamily)"
                        @blur="touched.fontFamily = true" />
                    <small v-if="touched.fontFamily && errors.fontFamily" class="settings-field-error">
                        {{ errors.fontFamily }}
                    </small>
                </label>
                <label class="terminal-settings-field">
                    <span>字号</span>
                    <input
                        v-model.number="form.fontSize"
                        type="number"
                        min="10"
                        max="24"
                        required
                        :aria-invalid="touched.fontSize && Boolean(errors.fontSize)"
                        @blur="touched.fontSize = true" />
                    <small v-if="touched.fontSize && errors.fontSize" class="settings-field-error">
                        {{ errors.fontSize }}
                    </small>
                </label>
                <label class="terminal-settings-field">
                    <span>行高</span>
                    <input
                        v-model.number="form.lineHeight"
                        type="number"
                        min="1"
                        max="2"
                        step="0.05"
                        required
                        :aria-invalid="touched.lineHeight && Boolean(errors.lineHeight)"
                        @blur="touched.lineHeight = true" />
                    <small v-if="touched.lineHeight && errors.lineHeight" class="settings-field-error">
                        {{ errors.lineHeight }}
                    </small>
                </label>
                <label
                    v-for="field in ['background', 'foreground', 'cursor']"
                    :key="field"
                    class="terminal-settings-field color-field">
                    <span>{{ { background: "背景色", foreground: "文字色", cursor: "光标色" }[field] }}</span>
                    <input v-model="form[field]" type="color" />
                </label>
            </form>
            <div class="settings-actions">
                <button class="settings-button primary" type="button" :disabled="invalid" @click="save">保存</button>
                <button class="settings-button" type="button" @click="reset">恢复默认</button>
            </div>
        </section>
    </div>
</template>
