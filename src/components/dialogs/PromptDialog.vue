<script setup>
import { reactive, watch } from "vue";
import { useStudioStore } from "../../stores/studio.js";

const studio = useStudioStore();
const form = reactive({ checked: false, behavior: "quit" });

watch(
    () => studio.activePrompt.value,
    (prompt) => {
        form.checked = Boolean(prompt?.checkbox?.checked);
        form.behavior = prompt?.closeBehavior?.selected || "quit";
    }
);
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
                            <input v-model="form.behavior" type="radio" :value="option.value" />
                            <span>{{ option.label }}</span>
                        </label>
                    </div>
                </div>
                <div class="dialog-actions" :class="{ 'has-checkbox': studio.activePrompt.value.checkbox }">
                    <label v-if="studio.activePrompt.value.checkbox" class="dialog-checkbox">
                        <input v-model="form.checked" type="checkbox" />
                        <span>{{ studio.activePrompt.value.checkbox.label }}</span>
                    </label>
                    <button
                        v-for="action in studio.activePrompt.value.actions"
                        :key="action.label"
                        class="dialog-btn"
                        :class="{ primary: action.primary, danger: action.danger }"
                        type="button"
                        @click="action.handler({ checked: form.checked, behavior: form.behavior })">
                        {{ action.label }}
                    </button>
                </div>
            </section>
        </div>
    </Transition>
</template>
