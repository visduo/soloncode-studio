<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { DEFAULT_TERMINAL_SETTINGS } from "../assets/js/constants.js";
import { useStudioStore } from "../stores/studio.js";

const studio = useStudioStore();
const activeSection = ref("preferences");
const preferencesDropdown = ref(null);
const preferencesDropdownOpen = ref(false);
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

function closePreferencesDropdown(event) {
    if (!preferencesDropdown.value?.contains(event.target)) preferencesDropdownOpen.value = false;
}

function selectRunTarget(target) {
    preferencesForm.defaultRunTarget = target;
    preferencesDropdownOpen.value = false;
}

function selectSection(section) {
    activeSection.value = section;
    preferencesDropdownOpen.value = false;
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
            <div class="preferences-settings-form">
                <div class="terminal-settings-field required-field">
                    <span>双击工作区默认启动方式</span>
                    <div
                        ref="preferencesDropdown"
                        class="settings-select"
                        :class="{ open: preferencesDropdownOpen }"
                        @keydown.esc="preferencesDropdownOpen = false">
                        <button
                            class="settings-select-trigger"
                            type="button"
                            aria-haspopup="listbox"
                            :aria-expanded="preferencesDropdownOpen"
                            @click="preferencesDropdownOpen = !preferencesDropdownOpen"
                            @keydown.down.prevent="preferencesDropdownOpen = true">
                            <span>{{ selectedRunTarget?.label.replace(/^启动 /, "") }}</span>
                            <span class="settings-select-chevron" aria-hidden="true"></span>
                        </button>
                        <Transition name="settings-select-menu">
                            <div v-if="preferencesDropdownOpen" class="settings-select-menu" role="listbox">
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
