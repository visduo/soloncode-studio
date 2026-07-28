<script setup>
import { computed } from "vue";

const props = defineProps({ name: { type: String, required: true } });
const icons = {
    home: "ri-apps-ai-line",
    workspaces: "ri-apps-line",
    learning: "ri-book-ai-line",
    "mode-cli": "ri-terminal-box-line",
    "mode-web": "ri-window-line",
    "add-workspace": "ri-folder-add-line",
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
    "rename-workspace": "ri-edit-2-line",
    "remove-workspace": "ri-delete-bin-line",
    "view-logs": "ri-timeline-view",
    "cli-settings": "ri-settings-4-line",
    "terminal-settings": "ri-settings-4-line",
    "install-java": "ri-install-line",
    "install-cli": "ri-install-line",
    "update-cli": "ri-download-cloud-line",
    "update-studio": "ri-download-cloud-line",
    "uninstall-cli": "ri-uninstall-line",
    documentation: "ri-book-open-line",
    "official-website": "ri-global-line",
    "source-repository": "ri-github-fill",
    refresh: "ri-refresh-line",
    loading: "ri-loader-4-fill",
    close: "ri-close-line"
};

const iconClass = computed(() => {
    const icon = icons[props.name];
    if (!icon && import.meta.env.DEV) console.warn(`Unknown app icon: ${props.name}`);
    return icon || "";
});
</script>

<template><i :class="[iconClass, 'app-icon', `app-icon-${name}`]" aria-hidden="true"></i></template>
