<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useStudioStore } from "../stores/studio.js";
import AppIcon from "./AppIcon.vue";

const studio = useStudioStore();
const tabBar = ref(null);
const hasOverflow = ref(false);
const canScrollPrevious = ref(false);
const canScrollNext = ref(false);
let draggedKey = null;
let resizeObserver;

function updateScrollControls() {
    const element = tabBar.value;
    if (!element) return;
    hasOverflow.value = element.scrollWidth > element.clientWidth + 1;
    canScrollPrevious.value = hasOverflow.value && element.scrollLeft > 1;
    canScrollNext.value = hasOverflow.value && element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
}

function scrollTabs(event) {
    if (tabBar.value.scrollWidth <= tabBar.value.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY))
        return;
    event.preventDefault();
    tabBar.value.scrollLeft += event.deltaY;
}

function revealTab(tab) {
    const container = tabBar.value;
    if (!container || !tab) return;
    const padding = 8;
    const tabLeft = tab.offsetLeft;
    const tabRight = tabLeft + tab.offsetWidth;
    const visibleLeft = container.scrollLeft + padding;
    const visibleRight = container.scrollLeft + container.clientWidth - padding;
    if (tabLeft < visibleLeft) {
        container.scrollTo({ left: Math.max(0, tabLeft - padding), behavior: "smooth" });
    } else if (tabRight > visibleRight) {
        container.scrollTo({ left: tabRight - container.clientWidth + padding, behavior: "smooth" });
    }
}

function activateHome(event) {
    studio.activateHome();
    revealTab(event.currentTarget);
}

function activateProject(event, key) {
    studio.activateProject(key);
    revealTab(event.currentTarget);
}

function dragStart(key) {
    draggedKey = key;
}
function drop(targetKey) {
    if (draggedKey) studio.reorderTab(draggedKey, targetKey);
    draggedKey = null;
}

watch(
    () => studio.orderedProjects.value.length,
    () => nextTick(updateScrollControls)
);

onMounted(() => {
    resizeObserver = new ResizeObserver(updateScrollControls);
    resizeObserver.observe(tabBar.value);
    updateScrollControls();
});

onBeforeUnmount(() => resizeObserver?.disconnect());

async function windowAction(action) {
    const appWindow = window.__TAURI__.window.getCurrentWindow();
    if (action === "minimize") await appWindow.minimize();
    if (action === "maximize") await appWindow.toggleMaximize();
    if (action === "close") await appWindow.close();
}
</script>

<template>
    <header class="title-bar">
        <div class="macos-traffic-light-space" aria-hidden="true"></div>
        <button
            v-if="hasOverflow"
            class="tab-scroll-control"
            type="button"
            :disabled="!canScrollPrevious"
            @click="tabBar.scrollBy({ left: -180, behavior: 'smooth' })">
            <i class="ri-arrow-left-s-line"></i>
        </button>
        <nav ref="tabBar" class="tab-bar" @scroll="updateScrollControls" @selectstart.prevent @wheel="scrollTabs">
            <button
                class="tab-item"
                :class="{ active: studio.state.activeTabKey === studio.constants.HOME_TAB_KEY }"
                type="button"
                @click="activateHome">
                <span class="tab-main">
                    <span class="tab-mode"><AppIcon name="home" /></span>
                </span>
            </button>
            <button
                v-for="project in studio.orderedProjects.value"
                :key="project.project_key"
                class="tab-item"
                :class="{
                    active: studio.state.activeTabKey === project.project_key,
                    'task-running': studio.taskSessions.has(project.project_key)
                }"
                type="button"
                draggable="true"
                @dragstart="dragStart(project.project_key)"
                @dragover.prevent
                @drop="drop(project.project_key)"
                @click="activateProject($event, project.project_key)">
                <span class="tab-main">
                    <span class="tab-mode">
                        <AppIcon
                            :name="
                                studio.taskSessions.has(project.project_key)
                                    ? 'loading'
                                    : project.mode === 'cli'
                                      ? 'mode-cli'
                                      : 'mode-web'
                            " />
                    </span>
                    <span class="tab-label">{{ project.name }}</span>
                </span>
                <span class="tab-close" @click.stop="studio.requestCloseProject(project.project_key)">
                    <AppIcon name="close" />
                </span>
            </button>
        </nav>
        <button
            v-if="hasOverflow"
            class="tab-scroll-control"
            type="button"
            :disabled="!canScrollNext"
            @click="tabBar.scrollBy({ left: 180, behavior: 'smooth' })">
            <i class="ri-arrow-right-s-line"></i>
        </button>
        <div class="title-bar-drag-region" data-tauri-drag-region></div>
        <div class="window-controls">
            <button class="window-control" type="button" @click="windowAction('minimize')">
                <i class="ri-subtract-line"></i>
            </button>
            <button class="window-control" type="button" @click="windowAction('maximize')">
                <i class="ri-checkbox-blank-line"></i>
            </button>
            <button class="window-control window-control-close" type="button" @click="windowAction('close')">
                <i class="ri-close-line"></i>
            </button>
        </div>
    </header>
</template>
