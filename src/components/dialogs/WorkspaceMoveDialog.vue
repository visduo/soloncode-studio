<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useStudioStore } from "../../stores/studio.js";

const studio = useStudioStore();
const dropdown = ref(null);
const open = ref(false);
const invalid = computed(
    () =>
        !studio.workspaceGroups.value.some((group) => group.id === studio.dialogForms.workspaceMoveGroupId) ||
        studio.dialogForms.workspaceMoveGroupId === studio.dialogForms.workspaceMoveSourceGroupId
);
const selectedGroup = computed(() =>
    studio.workspaceGroups.value.find((group) => group.id === studio.dialogForms.workspaceMoveGroupId)
);
const orderedGroups = computed(() =>
    [...studio.workspaceGroups.value].sort((left, right) => {
        if (left.id === studio.constants.DEFAULT_WORKSPACE_GROUP_ID) return -1;
        if (right.id === studio.constants.DEFAULT_WORKSPACE_GROUP_ID) return 1;
        return left.name.localeCompare(right.name, "zh-CN", { numeric: true, sensitivity: "base" });
    })
);

function selectGroup(groupId) {
    if (groupId === studio.dialogForms.workspaceMoveSourceGroupId) return;
    studio.dialogForms.workspaceMoveGroupId = groupId;
    open.value = false;
}

function closeOnOutsideClick(event) {
    if (!dropdown.value?.contains(event.target)) open.value = false;
}

onMounted(() => document.addEventListener("pointerdown", closeOnOutsideClick));
onBeforeUnmount(() => document.removeEventListener("pointerdown", closeOnOutsideClick));
watch(
    () => studio.dialogs.workspaceMove,
    (visible) => {
        if (!visible) open.value = false;
    }
);
</script>

<template>
    <Transition name="dialog">
        <div v-if="studio.dialogs.workspaceMove" class="dialog-backdrop">
            <section class="dialog-panel" role="dialog" aria-modal="true">
                <h2>移动分组</h2>
                <div class="remote-workspace-field required-field">
                    <span>目标分组</span>
                    <div ref="dropdown" class="group-select" :class="{ open }" @keydown.esc="open = false">
                        <button
                            class="group-select-trigger"
                            type="button"
                            aria-haspopup="listbox"
                            :aria-expanded="open"
                            :aria-invalid="invalid"
                            @click="open = !open"
                            @keydown.down.prevent="open = true">
                            <span>{{ selectedGroup?.name || "请选择目标分组" }}</span>
                            <span class="group-select-chevron" aria-hidden="true"></span>
                        </button>
                        <Transition name="group-select-menu">
                            <div v-if="open" class="group-select-menu" role="listbox">
                                <button
                                    v-for="group in orderedGroups"
                                    :key="group.id"
                                    class="group-select-option"
                                    :class="{ selected: group.id === studio.dialogForms.workspaceMoveGroupId }"
                                    type="button"
                                    role="option"
                                    :aria-selected="group.id === studio.dialogForms.workspaceMoveGroupId"
                                    :disabled="group.id === studio.dialogForms.workspaceMoveSourceGroupId"
                                    @click="selectGroup(group.id)">
                                    <span class="group-select-check" aria-hidden="true"></span>
                                    <span>{{ group.name }}</span>
                                    <small v-if="group.id === studio.dialogForms.workspaceMoveSourceGroupId">
                                        当前分组
                                    </small>
                                </button>
                            </div>
                        </Transition>
                    </div>
                    <small v-if="invalid" class="dialog-field-error">请选择其他分组</small>
                </div>
                <div class="dialog-actions">
                    <button class="dialog-btn" type="button" @click="studio.dialogs.workspaceMove = false">取消</button>
                    <button
                        class="dialog-btn primary"
                        type="button"
                        :disabled="invalid"
                        @click="studio.moveWorkspaceToGroup">
                        确定
                    </button>
                </div>
            </section>
        </div>
    </Transition>
</template>
