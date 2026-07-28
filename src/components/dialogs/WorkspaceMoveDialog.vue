<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "../../i18n/index.js";
import { useStudioStore } from "../../stores/studio.js";

const studio = useStudioStore();
const { locale, t } = useI18n();
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
const groupName = (group) =>
    group.id === studio.constants.DEFAULT_WORKSPACE_GROUP_ID ? t("workspace.defaultGroup") : group.name;
const orderedGroups = computed(() =>
    [...studio.workspaceGroups.value].sort((left, right) => {
        if (left.id === studio.constants.DEFAULT_WORKSPACE_GROUP_ID) return -1;
        if (right.id === studio.constants.DEFAULT_WORKSPACE_GROUP_ID) return 1;
        return groupName(left).localeCompare(groupName(right), locale.value, { numeric: true, sensitivity: "base" });
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
                <h2>{{ t("workspace.move") }}</h2>
                <div class="remote-workspace-field required-field">
                    <span>{{ t("dialog.targetGroup") }}</span>
                    <div ref="dropdown" class="group-select" :class="{ open }" @keydown.esc="open = false">
                        <button
                            class="group-select-trigger"
                            type="button"
                            aria-haspopup="listbox"
                            :aria-expanded="open"
                            :aria-invalid="invalid"
                            @click="open = !open"
                            @keydown.down.prevent="open = true">
                            <span>{{ selectedGroup ? groupName(selectedGroup) : t("dialog.selectGroup") }}</span>
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
                                    <span>{{ groupName(group) }}</span>
                                    <small v-if="group.id === studio.dialogForms.workspaceMoveSourceGroupId">
                                        {{ t("dialog.currentGroup") }}
                                    </small>
                                </button>
                            </div>
                        </Transition>
                    </div>
                    <small v-if="invalid" class="dialog-field-error">{{ t("dialog.selectOtherGroup") }}</small>
                </div>
                <div class="dialog-actions">
                    <button class="dialog-btn" type="button" @click="studio.dialogs.workspaceMove = false">
                        {{ t("common.cancel") }}
                    </button>
                    <button
                        class="dialog-btn primary"
                        type="button"
                        :disabled="invalid"
                        @click="studio.moveWorkspaceToGroup">
                        {{ t("common.confirm") }}
                    </button>
                </div>
            </section>
        </div>
    </Transition>
</template>
