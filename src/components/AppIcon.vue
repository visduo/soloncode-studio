<script setup>
import { computed } from "vue";

const props = defineProps({ name: { type: String, required: true } });
const icons = {
    home: "ri-apps-ai-line",
    workspaces: "ri-apps-line",
    learning: "ri-book-ai-line",
    environment: "ri-list-settings-line",
    settings: "ri-settings-4-line",
    "mode-cli": "ri-terminal-box-line",
    "mode-web": "ri-window-line",
    "add-workspace": "ri-folder-add-line",
    "add-group": "ri-folders-line",
    "group-expanded": "ri-arrow-down-s-line",
    "group-collapsed": "ri-arrow-right-s-line",
    "move-group": "ri-folder-transfer-line",
    "add-local-workspace": "ri-folder-open-line",
    "add-remote-workspace": "ri-upload-cloud-2-line",
    "edit-remote-workspace": "ri-edit-2-line",
    "start-workspace": "ri-play-large-line",
    "stop-workspace": "ri-stop-large-line",
    "open-project": "ri-external-link-line",
    "open-folder": "ri-folder-open-line",
    "open-external": "ri-external-link-line",
    "open-resource": "ri-external-link-line",
    "more-actions": "ri-more-fill",
    "pin-workspace": "ri-pushpin-line",
    "unpin-workspace": "ri-unpin-line",
    "rename-workspace": "ri-edit-2-line",
    "remove-workspace": "ri-delete-bin-line",
    "view-logs": "ri-timeline-view",
    "install-java": "ri-install-line",
    "install-cli": "ri-install-line",
    "update-cli": "ri-install-line",
    "update-studio": "ri-install-line",
    "uninstall-cli": "ri-uninstall-line",
    documentation: "ri-book-open-line",
    "official-website": "ri-global-line",
    "source-repository": "ri-github-fill",
    refresh: "ri-refresh-line",
    loading: "ri-loader-4-fill",
    success: "ri-checkbox-circle-line",
    error: "ri-error-warning-line",
    close: "ri-close-line"
};

const iconClass = computed(() => {
    const icon = icons[props.name];
    if (!icon && import.meta.env.DEV) console.warn(`Unknown app icon: ${props.name}`);
    return icon || "";
});
</script>

<template><i :class="[iconClass, 'app-icon', `app-icon-${name}`]" aria-hidden="true"></i></template>
