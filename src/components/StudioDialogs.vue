<script setup>
import PromptDialog from "./dialogs/PromptDialog.vue";
import RemoteWorkspaceDialog from "./dialogs/RemoteWorkspaceDialog.vue";
import TerminalSettingsDialog from "./dialogs/TerminalSettingsDialog.vue";
import WorkspaceGroupDialog from "./dialogs/WorkspaceGroupDialog.vue";
import WorkspaceInfoDialog from "./dialogs/WorkspaceInfoDialog.vue";
import WorkspaceLogsDialog from "./dialogs/WorkspaceLogsDialog.vue";
import WorkspaceMoveDialog from "./dialogs/WorkspaceMoveDialog.vue";
</script>

<template>
    <PromptDialog />
    <WorkspaceInfoDialog />
    <RemoteWorkspaceDialog />
    <WorkspaceGroupDialog />
    <WorkspaceMoveDialog />
    <WorkspaceLogsDialog />
    <TerminalSettingsDialog />
</template>
