<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useStudioStore } from "../stores/studio.js";
import AppIcon from "./AppIcon.vue";

const studio = useStudioStore();
const tabBar = ref(null);
const hasOverflow = ref(false);
const canScrollPrevious = ref(false);
const canScrollNext = ref(false);
const isFullscreen = ref(false);
const appWindow = window.__TAURI__.window.getCurrentWindow();
let draggedKey = null;
let draggedTab = null;
let dropTarget = null;
let dropAfter = false;
let pointerStartX = 0;
let suppressTabClick = false;
let resizeObserver;
let unlistenWindowResize;

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
    if (suppressTabClick) {
        suppressTabClick = false;
        return;
    }
    studio.activateProject(key);
    revealTab(event.currentTarget);
}

function pointerDown(event, key) {
    if (event.button !== 0 || event.target.closest(".tab-close")) return;
    suppressTabClick = false;
    draggedKey = key;
    draggedTab = event.currentTarget;
    pointerStartX = event.clientX;
    draggedTab.setPointerCapture(event.pointerId);
}

function pointerMove(event) {
    if (!draggedTab || !draggedKey) return;
    if (!draggedTab.classList.contains("dragging")) {
        if (Math.abs(event.clientX - pointerStartX) < 5) return;
        draggedTab.classList.add("dragging");
        suppressTabClick = true;
    }
    const target = document
        .elementsFromPoint(event.clientX, event.clientY)
        .map((element) => element.closest?.(".tab-item[data-project-key]"))
        .find((element) => element && element !== draggedTab);
    const nextDropAfter = Boolean(target && draggedTab.offsetLeft < target.offsetLeft);
    if (target === dropTarget && nextDropAfter === dropAfter) return;
    dropTarget?.classList.remove("drag-over-before", "drag-over-after");
    dropTarget = target || null;
    dropAfter = nextDropAfter;
    dropTarget?.classList.add(dropAfter ? "drag-over-after" : "drag-over-before");
}

function finishPointerDrag(event) {
    if (!draggedTab) return;
    const targetKey = dropTarget?.dataset.projectKey;
    if (draggedTab.hasPointerCapture(event.pointerId)) draggedTab.releasePointerCapture(event.pointerId);
    draggedTab.classList.remove("dragging");
    dropTarget?.classList.remove("drag-over-before", "drag-over-after");
    if (suppressTabClick && targetKey) studio.reorderTab(draggedKey, targetKey);
    draggedKey = null;
    draggedTab = null;
    dropTarget = null;
    dropAfter = false;
}

function cancelPointerDrag(event) {
    if (draggedTab?.hasPointerCapture(event.pointerId)) draggedTab.releasePointerCapture(event.pointerId);
    draggedTab?.classList.remove("dragging");
    dropTarget?.classList.remove("drag-over-before", "drag-over-after");
    draggedKey = null;
    draggedTab = null;
    dropTarget = null;
    dropAfter = false;
    suppressTabClick = false;
}

async function updateFullscreenState() {
    isFullscreen.value = await appWindow.isFullscreen();
}

watch(
    () => studio.orderedProjects.value.length,
    () => nextTick(updateScrollControls)
);

onMounted(async () => {
    resizeObserver = new ResizeObserver(updateScrollControls);
    resizeObserver.observe(tabBar.value);
    updateScrollControls();
    await updateFullscreenState();
    unlistenWindowResize = await appWindow.onResized(updateFullscreenState);
});

onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    unlistenWindowResize?.();
});

async function windowAction(action) {
    if (action === "minimize") await appWindow.minimize();
    if (action === "maximize") await appWindow.toggleMaximize();
    if (action === "close") await appWindow.close();
}
</script>

<template>
    <header class="title-bar">
        <div v-if="!isFullscreen" class="macos-traffic-light-space" aria-hidden="true"></div>
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
                :data-project-key="project.project_key"
                :class="{
                    active: studio.state.activeTabKey === project.project_key,
                    'task-running': studio.taskSessions.has(project.project_key)
                }"
                type="button"
                @pointerdown="pointerDown($event, project.project_key)"
                @pointermove="pointerMove"
                @pointerup="finishPointerDrag"
                @pointercancel="cancelPointerDrag"
                @click="activateProject($event, project.project_key)">
                <span class="tab-main">
                    <span class="tab-mode">
                        <Transition name="icon-swap" mode="out-in">
                            <AppIcon
                                :key="
                                    studio.taskSessions.has(project.project_key)
                                        ? 'loading'
                                        : project.mode === 'cli'
                                          ? 'mode-cli'
                                          : 'mode-web'
                                "
                                :name="
                                    studio.taskSessions.has(project.project_key)
                                        ? 'loading'
                                        : project.mode === 'cli'
                                          ? 'mode-cli'
                                          : 'mode-web'
                                " />
                        </Transition>
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
