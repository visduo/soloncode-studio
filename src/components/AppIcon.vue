<script setup>
defineProps({ name: { type: String, required: true } });
const icons = {
    home: "ri-home-3-line",
    cli: "ri-terminal-box-line",
    web: "ri-window-line",
    close: "ri-close-line",
    settings: "ri-settings-4-line",
    folder: "ri-folder-open-line",
    learning: "ri-book-ai-line",
    add: "ri-folder-add-line",
    play: "ri-play-large-line",
    stop: "ri-stop-large-line",
    more: "ri-more-2-fill",
    pin: "ri-pushpin-line",
    edit: "ri-edit-2-line",
    remove: "ri-delete-bin-line",
    external: "ri-external-link-line",
    log: "ri-timeline-view",
    loading: "ri-loader-4-fill",
    install: "ri-install-line",
    github: "ri-github-fill",
    website: "ri-macbook-line",
    refresh: "ri-refresh-line"
};
</script>

<template><i :class="[icons[name] || icons.play, 'app-icon', `app-icon-${name}`]" aria-hidden="true"></i></template>
