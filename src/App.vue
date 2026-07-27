<script setup>
import { onBeforeUnmount, onMounted, watch } from "vue";
import HomeSidebar from "./components/HomeSidebar.vue";
import LearningPanel from "./components/LearningPanel.vue";
import ProjectHost from "./components/ProjectHost.vue";
import StudioDialogs from "./components/StudioDialogs.vue";
import TitleTabs from "./components/TitleTabs.vue";
import WorkspacePanel from "./components/WorkspacePanel.vue";
import { useStudioStore } from "./stores/studio.js";

const studio = useStudioStore();
let cleanupEvents;

function handleDocumentClick(event) {
    if (!event.target.closest(".app-menu-wrap")) studio.state.openMenu = null;
}

function handleDocumentKeydown(event) {
    if (event.key !== "Escape") return;
    studio.state.openMenu = null;
    studio.dialogs.logs = false;
}

watch(
    () => studio.state.activeTabKey,
    (key) => document.body.classList.toggle("project-mode", key !== studio.constants.HOME_TAB_KEY),
    { immediate: true }
);
onMounted(async () => {
    const platform = /Mac|iPhone|iPad/.test(navigator.platform)
        ? "macos"
        : /Win/.test(navigator.platform)
          ? "windows"
          : "linux";
    document.documentElement.classList.add(`platform-${platform}`);
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleDocumentKeydown);
    cleanupEvents = studio.registerEvents();
    await studio.initialize();
});
onBeforeUnmount(() => {
    document.removeEventListener("click", handleDocumentClick);
    document.removeEventListener("keydown", handleDocumentKeydown);
    cleanupEvents?.();
});
</script>

<template>
    <div class="launcher-container">
        <main class="app-shell">
            <TitleTabs />
            <div v-show="studio.state.activeTabKey === studio.constants.HOME_TAB_KEY" class="home-view">
                <HomeSidebar />
                <WorkspacePanel v-if="studio.state.homeSection === 'workspace'" />
                <LearningPanel v-else />
            </div>
            <ProjectHost />
        </main>
        <StudioDialogs />
    </div>
</template>

<style>
.vue-project-host {
    width: 100%;
    height: 100%;
}
</style>
