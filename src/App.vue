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

function dismissMenu() {
    if (!studio.state.openMenu) return;
    studio.dismissMenu();
}

function handleDocumentPointerDown(event) {
    if (!event.target.closest(".app-menu-wrap, .app-menu")) dismissMenu();
}

function handleDocumentKeydown(event) {
    if (event.key !== "Escape") return;
    dismissMenu();
    studio.dialogs.logs = false;
}

watch(
    () => studio.state.activeTabKey,
    (key) => document.body.classList.toggle("project-mode", key !== studio.constants.HOME_TAB_KEY),
    { immediate: true }
);
watch(
    () => [
        studio.activePrompt.value,
        studio.dialogs.alias,
        studio.dialogs.remote,
        studio.dialogs.logs,
        studio.dialogs.terminalSettings
    ],
    (modalStates) => {
        if (modalStates.some(Boolean)) dismissMenu();
    },
    { flush: "sync" }
);
onMounted(async () => {
    const platform = /Mac|iPhone|iPad/.test(navigator.platform)
        ? "macos"
        : /Win/.test(navigator.platform)
          ? "windows"
          : "linux";
    document.documentElement.classList.add(`platform-${platform}`);
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    document.addEventListener("keydown", handleDocumentKeydown);
    cleanupEvents = studio.registerEvents();
    await studio.initialize();
});
onBeforeUnmount(() => {
    document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
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
                <section class="home-content-panel">
                    <WorkspacePanel v-if="studio.state.homeSection === 'workspace'" />
                    <LearningPanel v-else />
                </section>
            </div>
            <ProjectHost v-show="studio.state.activeTabKey !== studio.constants.HOME_TAB_KEY" />
        </main>
        <StudioDialogs />
    </div>
</template>
