<script setup>
import { nextTick, reactive } from "vue";
import { useStudioStore } from "../stores/studio.js";
import AppIcon from "./AppIcon.vue";
const studio = useStudioStore();
const menuPosition = reactive({ left: "0px", top: "0px" });

function menuKey(type, entry) {
    return `${type}:${studio.workspaceKey(entry.path)}`;
}

function releaseMenuFocus(event) {
    event.target.closest("button")?.blur();
    queueMicrotask(() => {
        studio.state.openMenu = null;
    });
}

async function toggle(event, type, entry) {
    const key = menuKey(type, entry);
    if (studio.state.openMenu === key) {
        studio.state.openMenu = null;
        return;
    }
    const triggerBounds = event.currentTarget.getBoundingClientRect();
    studio.state.openMenu = key;
    await nextTick();
    const menu = document.querySelector(`[data-floating-menu="${CSS.escape(key)}"]`);
    if (!menu) return;
    const menuBounds = menu.getBoundingClientRect();
    const viewportPadding = 8;
    const gap = 6;
    const left = Math.min(
        window.innerWidth - menuBounds.width - viewportPadding,
        Math.max(viewportPadding, triggerBounds.right - menuBounds.width)
    );
    const spaceBelow = window.innerHeight - triggerBounds.bottom - viewportPadding;
    const top =
        spaceBelow >= menuBounds.height + gap
            ? triggerBounds.bottom + gap
            : Math.max(viewportPadding, triggerBounds.top - menuBounds.height - gap);
    menuPosition.left = `${left}px`;
    menuPosition.top = `${top}px`;
}
</script>

<template>
    <section class="main-panel">
        <div class="welcome-toolbar">
            <label class="workspace-search">
                <span class="workspace-search-icon"><i class="ri-search-line"></i></span>
                <input
                    v-model="studio.state.workspaceSearch"
                    type="search"
                    aria-label="搜索工作区"
                    placeholder="搜索工作区" />
            </label>
            <div class="welcome-actions">
                <div class="app-menu-wrap workspace-add-menu-wrap">
                    <button
                        class="welcome-action primary workspace-add-trigger"
                        type="button"
                        @click="studio.state.openMenu = studio.state.openMenu === 'add' ? null : 'add'">
                        <span class="workspace-add-icon"><AppIcon name="add" /></span>
                        <span>添加工作区</span>
                    </button>
                    <div
                        v-if="studio.state.openMenu === 'add'"
                        class="app-menu workspace-add-menu"
                        @click.capture="releaseMenuFocus">
                        <button class="app-menu-item" type="button" @click="studio.pickWorkspace">
                            <span class="app-menu-icon"><AppIcon name="folder" /></span>
                            <span>本地工作区</span>
                        </button>
                        <button class="app-menu-item" type="button" @click="studio.showRemoteDialog()">
                            <span class="app-menu-icon"><i class="ri-upload-cloud-fill app-icon"></i></span>
                            <span>远程工作区</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
        <div class="workspace-list">
            <div
                v-for="entry in studio.visibleWorkspaces.value"
                :key="entry.path || studio.constants.HOME_WORKSPACE_KEY"
                class="workspace-item"
                :class="{
                    active: studio.state.selectedWorkspace === entry.path,
                    running: studio.projectForWorkspace(entry.path)
                }"
                @click="studio.selectWorkspace(entry.path)">
                <button class="workspace-copy" type="button">
                    <span class="workspace-text">
                        <span class="workspace-name">{{ entry.name }}</span>
                        <span class="workspace-path">{{ entry.detail }}</span>
                    </span>
                </button>
                <div class="workspace-actions" @click.stop>
                    <button
                        v-if="entry.type === 'remote'"
                        class="workspace-icon-btn run"
                        type="button"
                        @click="studio.openWebPage(entry.detail)">
                        <AppIcon name="external" />
                    </button>
                    <template v-else-if="studio.projectForWorkspace(entry.path)">
                        <button
                            class="workspace-icon-btn run"
                            type="button"
                            @click="studio.openProject(studio.projectForWorkspace(entry.path))">
                            <AppIcon name="external" />
                        </button>
                        <button
                            class="workspace-icon-btn stop"
                            type="button"
                            @click="studio.stopWorkspace(entry.path, studio.projectForWorkspace(entry.path).mode)">
                            <AppIcon name="stop" />
                        </button>
                    </template>
                    <div v-else class="app-menu-wrap">
                        <button
                            class="workspace-icon-btn run"
                            :class="{ loading: studio.startingWorkspaceKeys.has(studio.workspaceKey(entry.path)) }"
                            type="button"
                            :disabled="
                                studio.state.busy || studio.startingWorkspaceKeys.has(studio.workspaceKey(entry.path))
                            "
                            @click="toggle($event, 'run', entry)">
                            <AppIcon
                                :name="
                                    studio.startingWorkspaceKeys.has(studio.workspaceKey(entry.path))
                                        ? 'loading'
                                        : 'play'
                                " />
                        </button>
                        <Teleport to="body">
                            <div
                                v-if="studio.state.openMenu === menuKey('run', entry)"
                                class="app-menu run-target-menu"
                                :data-floating-menu="menuKey('run', entry)"
                                :style="menuPosition"
                                @click.capture="releaseMenuFocus"
                                @click.stop>
                                <button
                                    v-for="target in studio.runTargets"
                                    :key="target.key"
                                    class="app-menu-item run-target-menu-item"
                                    type="button"
                                    @click="studio.runWorkspace(entry.path, target.key)">
                                    {{ target.label }}
                                </button>
                            </div>
                        </Teleport>
                    </div>
                    <button
                        v-if="entry.type !== 'remote'"
                        class="workspace-icon-btn folder"
                        type="button"
                        @click="studio.revealWorkspace(entry.path)">
                        <AppIcon name="folder" />
                    </button>
                    <div class="app-menu-wrap">
                        <button
                            class="workspace-icon-btn more"
                            type="button"
                            @click="toggle($event, 'more', entry)">
                            <AppIcon name="more" />
                        </button>
                        <Teleport to="body">
                            <div
                                v-if="studio.state.openMenu === menuKey('more', entry)"
                                class="app-menu"
                                :data-floating-menu="menuKey('more', entry)"
                                :style="menuPosition"
                                @click.capture="releaseMenuFocus"
                                @click.stop>
                                <button
                                    v-if="entry.path"
                                    class="app-menu-item"
                                    type="button"
                                    @click="studio.togglePinned(entry.path)">
                                    <span class="app-menu-icon"><AppIcon name="pin" /></span>
                                    <span>{{ entry.pinned ? "取消置顶" : "置顶" }}</span>
                                </button>
                                <button
                                    v-if="entry.removable"
                                    class="app-menu-item"
                                    type="button"
                                    @click="studio.showAliasDialog(entry.path)">
                                    <span class="app-menu-icon"><AppIcon name="edit" /></span>
                                    <span>重命名</span>
                                </button>
                                <button
                                    v-if="entry.type === 'remote'"
                                    class="app-menu-item"
                                    type="button"
                                    @click="studio.showRemoteDialog(entry.path)">
                                    <span class="app-menu-icon"><AppIcon name="edit" /></span>
                                    <span>修改地址</span>
                                </button>
                                <button
                                    v-if="entry.type === 'remote'"
                                    class="app-menu-item"
                                    type="button"
                                    @click="studio.openExternalUrl(entry.detail)">
                                    <span class="app-menu-icon"><AppIcon name="external" /></span>
                                    <span>使用系统浏览器打开</span>
                                </button>
                                <button
                                    v-if="entry.type !== 'remote'"
                                    class="app-menu-item"
                                    type="button"
                                    @click="studio.showLogsDialog(entry.path)">
                                    <span class="app-menu-icon"><AppIcon name="log" /></span>
                                    <span>运行日志</span>
                                </button>
                                <button
                                    v-if="entry.removable"
                                    class="app-menu-item"
                                    type="button"
                                    @click="studio.removeWorkspace(entry.path)">
                                    <span class="app-menu-icon"><AppIcon name="remove" /></span>
                                    <span>移除工作区</span>
                                </button>
                            </div>
                        </Teleport>
                    </div>
                </div>
            </div>
        </div>
    </section>
</template>
