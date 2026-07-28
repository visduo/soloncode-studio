<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { DEFAULT_TERMINAL_SETTINGS, INTERFACE_STYLE_OPTIONS } from "../assets/js/constants.js";
import { useStudioStore } from "../stores/studio.js";

const studio = useStudioStore();
const activeSection = ref("preferences");
const preferencesSettingsForm = ref(null);
const openPreferencesDropdown = ref(null);
const preferencesForm = reactive({ ...studio.state.preferences });
const form = reactive({ ...studio.state.terminalSettings });
const touched = reactive({ fontFamily: false, fontSize: false, lineHeight: false });
const errors = computed(() => ({
    fontFamily: form.fontFamily.trim() ? "" : "请输入字体名称",
    fontSize: Number.isFinite(form.fontSize) && form.fontSize >= 10 && form.fontSize <= 24 ? "" : "字号应为 10 至 24",
    lineHeight:
        Number.isFinite(form.lineHeight) && form.lineHeight >= 1 && form.lineHeight <= 2 ? "" : "行高应为 1 至 2"
}));
const invalid = computed(() => Object.values(errors.value).some(Boolean));
const selectedRunTarget = computed(() =>
    studio.runTargets.find((target) => target.key === preferencesForm.defaultRunTarget)
);
const selectedInterfaceStyle = computed(() =>
    INTERFACE_STYLE_OPTIONS.find((style) => style.key === preferencesForm.interfaceStyle)
);

function closePreferencesDropdown(event) {
    if (!preferencesSettingsForm.value?.contains(event.target)) openPreferencesDropdown.value = null;
}

function selectRunTarget(target) {
    preferencesForm.defaultRunTarget = target;
    openPreferencesDropdown.value = null;
}

function selectInterfaceStyle(style) {
    preferencesForm.interfaceStyle = style;
    openPreferencesDropdown.value = null;
}

function selectSection(section) {
    activeSection.value = section;
    openPreferencesDropdown.value = null;
    if (section === "preferences") Object.assign(preferencesForm, studio.state.preferences);
    else {
        Object.assign(form, studio.state.terminalSettings);
        Object.assign(touched, { fontFamily: false, fontSize: false, lineHeight: false });
    }
}

function savePreferences() {
    studio.saveAppPreferences(preferencesForm);
}

onMounted(() => document.addEventListener("pointerdown", closePreferencesDropdown));
onBeforeUnmount(() => document.removeEventListener("pointerdown", closePreferencesDropdown));

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

        <section v-if="activeSection === 'preferences'" class="settings-content preferences-settings-section">
            <div ref="preferencesSettingsForm" class="preferences-settings-form">
                <div class="terminal-settings-field required-field">
                    <span>双击工作区默认启动方式</span>
                    <div
                        class="settings-select"
                        :class="{ open: openPreferencesDropdown === 'run-target' }"
                        @keydown.esc="openPreferencesDropdown = null">
                        <button
                            class="settings-select-trigger"
                            type="button"
                            aria-haspopup="listbox"
                            :aria-expanded="openPreferencesDropdown === 'run-target'"
                            @click="
                                openPreferencesDropdown = openPreferencesDropdown === 'run-target' ? null : 'run-target'
                            "
                            @keydown.down.prevent="openPreferencesDropdown = 'run-target'">
                            <span>{{ selectedRunTarget?.label.replace(/^启动 /, "") }}</span>
                            <span class="settings-select-chevron" aria-hidden="true"></span>
                        </button>
                        <Transition name="settings-select-menu">
                            <div
                                v-if="openPreferencesDropdown === 'run-target'"
                                class="settings-select-menu"
                                role="listbox">
                                <button
                                    v-for="target in studio.runTargets"
                                    :key="target.key"
                                    class="settings-select-option"
                                    :class="{ selected: target.key === preferencesForm.defaultRunTarget }"
                                    type="button"
                                    role="option"
                                    :aria-selected="target.key === preferencesForm.defaultRunTarget"
                                    @click="selectRunTarget(target.key)">
                                    <span class="settings-select-check" aria-hidden="true"></span>
                                    <span>{{ target.label.replace(/^启动 /, "") }}</span>
                                </button>
                            </div>
                        </Transition>
                    </div>
                </div>
                <div class="terminal-settings-field required-field">
                    <span>主题</span>
                    <div
                        class="settings-select"
                        :class="{ open: openPreferencesDropdown === 'interface-style' }"
                        @keydown.esc="openPreferencesDropdown = null">
                        <button
                            class="settings-select-trigger"
                            type="button"
                            aria-haspopup="listbox"
                            :aria-expanded="openPreferencesDropdown === 'interface-style'"
                            @click="
                                openPreferencesDropdown =
                                    openPreferencesDropdown === 'interface-style' ? null : 'interface-style'
                            "
                            @keydown.down.prevent="openPreferencesDropdown = 'interface-style'">
                            <span>{{ selectedInterfaceStyle?.label }}</span>
                            <span class="settings-select-chevron" aria-hidden="true"></span>
                        </button>
                        <Transition name="settings-select-menu">
                            <div
                                v-if="openPreferencesDropdown === 'interface-style'"
                                class="settings-select-menu"
                                role="listbox">
                                <button
                                    v-for="style in INTERFACE_STYLE_OPTIONS"
                                    :key="style.key"
                                    class="settings-select-option"
                                    :class="{ selected: style.key === preferencesForm.interfaceStyle }"
                                    type="button"
                                    role="option"
                                    :aria-selected="style.key === preferencesForm.interfaceStyle"
                                    @click="selectInterfaceStyle(style.key)">
                                    <span class="settings-select-check" aria-hidden="true"></span>
                                    <span>{{ style.label }}</span>
                                </button>
                            </div>
                        </Transition>
                    </div>
                </div>
            </div>
            <div class="settings-actions">
                <button class="settings-button primary" type="button" @click="savePreferences">保存</button>
            </div>
        </section>
        <section v-else class="settings-content terminal-settings-section">
            <form class="terminal-settings-form" @submit.prevent>
                <label class="terminal-settings-field terminal-settings-field-wide required-field">
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
                <label class="terminal-settings-field required-field">
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
                <label class="terminal-settings-field required-field">
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
