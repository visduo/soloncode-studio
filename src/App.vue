<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import EnvironmentPanel from "./components/EnvironmentPanel.vue";
import HomeSidebar from "./components/HomeSidebar.vue";
import LearningPanel from "./components/LearningPanel.vue";
import ProjectHost from "./components/ProjectHost.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import StudioDialogs from "./components/StudioDialogs.vue";
import StudioMessage from "./components/StudioMessage.vue";
import TitleTabs from "./components/TitleTabs.vue";
import WorkspacePanel from "./components/WorkspacePanel.vue";
import { useStudioStore } from "./stores/studio.js";

const studio = useStudioStore();
const appWindow = window.__TAURI__.window.getCurrentWindow();
const systemPrefersDark = ref(false);
const resolvedThemeMode = computed(() =>
    studio.state.preferences.themeMode === "system"
        ? systemPrefersDark.value
            ? "dark"
            : "light"
        : studio.state.preferences.themeMode
);
let cleanupEvents;
let unlistenThemeChanged;

function applyThemeMode(mode) {
    studio.state.resolvedThemeMode = mode;
    document.documentElement.classList.remove("theme-mode-light", "theme-mode-dark");
    document.documentElement.classList.add(`theme-mode-${mode}`);
    document.documentElement.style.colorScheme = mode;
}

async function refreshSystemTheme() {
    const theme = await appWindow.theme();
    if (theme === "dark" || theme === "light") systemPrefersDark.value = theme === "dark";
}

function handleSystemThemeChange(event) {
    if (event.payload === "dark" || event.payload === "light") systemPrefersDark.value = event.payload === "dark";
}

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
    () => studio.state.preferences.themeMode,
    (mode) => {
        if (mode === "system") refreshSystemTheme();
    },
    { flush: "sync", immediate: true }
);
watch(resolvedThemeMode, applyThemeMode, { immediate: true });
watch(
    () => [
        studio.activePrompt.value,
        studio.dialogs.alias,
        studio.dialogs.remote,
        studio.dialogs.workspaceGroup,
        studio.dialogs.workspaceMove,
        studio.dialogs.logs
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
    unlistenThemeChanged = await appWindow.onThemeChanged(handleSystemThemeChange);
    await refreshSystemTheme();
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    document.addEventListener("keydown", handleDocumentKeydown);
    cleanupEvents = studio.registerEvents();
    await studio.initialize();
});
onBeforeUnmount(() => {
    unlistenThemeChanged?.();
    document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
    document.removeEventListener("keydown", handleDocumentKeydown);
    cleanupEvents?.();
});
</script>

<template>
    <div
        class="launcher-container"
        :class="[`theme-${studio.state.preferences.interfaceStyle}`, `theme-mode-${resolvedThemeMode}`]">
        <main class="app-shell">
            <TitleTabs />
            <div v-show="studio.state.activeTabKey === studio.constants.HOME_TAB_KEY" class="home-view">
                <HomeSidebar />
                <section class="home-content-panel">
                    <WorkspacePanel v-if="studio.state.homeSection === 'workspace'" />
                    <LearningPanel v-else-if="studio.state.homeSection === 'learning'" />
                    <EnvironmentPanel v-else-if="studio.state.homeSection === 'environment'" />
                    <SettingsPanel v-else />
                </section>
            </div>
            <ProjectHost v-show="studio.state.activeTabKey !== studio.constants.HOME_TAB_KEY" />
        </main>
        <StudioMessage />
        <StudioDialogs />
    </div>
</template>
