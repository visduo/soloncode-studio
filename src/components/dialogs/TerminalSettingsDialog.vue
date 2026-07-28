<script setup>
import { computed, reactive, watch } from "vue";
import { DEFAULT_TERMINAL_SETTINGS } from "../../assets/js/constants.js";
import { useStudioStore } from "../../stores/studio.js";

const studio = useStudioStore();
const form = reactive({ ...studio.state.terminalSettings });
const touched = reactive({ fontFamily: false, fontSize: false, lineHeight: false });
const errors = computed(() => ({
    fontFamily: form.fontFamily.trim() ? "" : "请输入字体名称",
    fontSize: Number.isFinite(form.fontSize) && form.fontSize >= 10 && form.fontSize <= 24 ? "" : "字号应为 10 至 24",
    lineHeight:
        Number.isFinite(form.lineHeight) && form.lineHeight >= 1 && form.lineHeight <= 2 ? "" : "行高应为 1 至 2"
}));
const invalid = computed(() => Object.values(errors.value).some(Boolean));

watch(
    () => studio.dialogs.terminalSettings,
    (open) => {
        if (open) {
            Object.assign(form, studio.state.terminalSettings);
            Object.assign(touched, { fontFamily: false, fontSize: false, lineHeight: false });
        }
    }
);

function save() {
    if (invalid.value) return;
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
                        <input
                            v-model="form.fontFamily"
                            required
                            :aria-invalid="touched.fontFamily && Boolean(errors.fontFamily)"
                            @blur="touched.fontFamily = true" />
                        <small v-if="touched.fontFamily && errors.fontFamily" class="dialog-field-error">
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
                        <small v-if="touched.fontSize && errors.fontSize" class="dialog-field-error">
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
                        <small v-if="touched.lineHeight && errors.lineHeight" class="dialog-field-error">
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
                <div class="dialog-actions">
                    <button class="dialog-btn" type="button" @click="reset">恢复默认</button>
                    <button class="dialog-btn" type="button" @click="studio.dialogs.terminalSettings = false">
                        取消
                    </button>
                    <button class="dialog-btn primary" type="button" :disabled="invalid" @click="save">保存</button>
                </div>
            </section>
        </div>
    </Transition>
</template>
