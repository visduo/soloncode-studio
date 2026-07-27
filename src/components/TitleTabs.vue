<script setup>
import { ref } from "vue";
import { useStudioStore } from "../stores/studio.js";
import AppIcon from "./AppIcon.vue";

const studio = useStudioStore();
const tabBar = ref(null);
let draggedKey = null;

function scrollTabs(event) {
    if (tabBar.value.scrollWidth <= tabBar.value.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY))
        return;
    event.preventDefault();
    tabBar.value.scrollLeft += event.deltaY;
}

function dragStart(key) {
    draggedKey = key;
}
function drop(targetKey) {
    if (draggedKey) studio.reorderTab(draggedKey, targetKey);
    draggedKey = null;
}
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
            class="tab-scroll-control"
            type="button"
            title="向前滚动标签页"
            @click="tabBar.scrollBy({ left: -180, behavior: 'smooth' })">
            <i class="ri-arrow-left-s-line"></i>
        </button>
        <nav ref="tabBar" class="tab-bar" @wheel="scrollTabs">
            <button
                class="tab-item"
                :class="{ active: studio.state.activeTabKey === studio.constants.HOME_TAB_KEY }"
                type="button"
                @click="studio.activateHome">
                <span class="tab-main">
                    <span class="tab-mode"><AppIcon name="home" /></span>
                    <span class="tab-label">首页</span>
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
                @click="studio.activateProject(project.project_key)">
                <span class="tab-main">
                    <span class="tab-mode">
                        <AppIcon
                            :name="
                                studio.taskSessions.has(project.project_key)
                                    ? 'loading'
                                    : project.mode === 'cli'
                                      ? 'cli'
                                      : 'web'
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
            class="tab-scroll-control"
            type="button"
            title="向后滚动标签页"
            @click="tabBar.scrollBy({ left: 180, behavior: 'smooth' })">
            <i class="ri-arrow-right-s-line"></i>
        </button>
        <div class="title-bar-drag-region" data-tauri-drag-region></div>
        <div class="window-controls">
            <button class="window-control" type="button" title="最小化窗口" @click="windowAction('minimize')">
                <i class="ri-subtract-line"></i>
            </button>
            <button class="window-control" type="button" title="最大化窗口" @click="windowAction('maximize')">
                <i class="ri-checkbox-blank-line"></i>
            </button>
            <button
                class="window-control window-control-close"
                type="button"
                title="关闭窗口"
                @click="windowAction('close')">
                <i class="ri-close-line"></i>
            </button>
        </div>
    </header>
</template>
