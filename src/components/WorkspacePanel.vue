<script setup>
import { nextTick, reactive } from "vue";
import { useStudioStore } from "../stores/studio.js";
import AppIcon from "./AppIcon.vue";
const studio = useStudioStore();
const menuPosition = reactive({ left: "0px", top: "0px" });

function menuKey(type, entry) {
    return `${type}:${studio.workspaceKey(entry.path)}`;
}

function workspaceInitial(name) {
    return Array.from(String(name || "?").trim())[0]?.toLocaleUpperCase() || "?";
}

function toggleAddMenu() {
    if (studio.state.openMenu === "add") studio.dismissMenu();
    else studio.state.openMenu = "add";
}

async function toggle(event, type, entry) {
    const key = menuKey(type, entry);
    if (studio.state.openMenu === key) {
        studio.dismissMenu();
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
    <div class="main-panel">
        <div class="workspace-content">
            <div class="welcome-toolbar">
                <label class="workspace-search">
                    <span class="workspace-search-icon"><i class="ri-search-line"></i></span>
                    <input v-model="studio.state.workspaceSearch" type="search" placeholder="搜索工作区" />
                </label>
                <div class="welcome-actions">
                    <button
                        class="welcome-action primary workspace-add-trigger"
                        type="button"
                        @click="studio.showWorkspaceGroupDialog">
                        <span class="welcome-action-icon"><AppIcon name="add-group" /></span>
                        <span>创建分组</span>
                    </button>
                    <div class="app-menu-wrap workspace-add-menu-wrap">
                        <button
                            class="welcome-action primary workspace-add-trigger"
                            type="button"
                            @click="toggleAddMenu">
                            <span class="welcome-action-icon"><AppIcon name="add-workspace" /></span>
                            <span>添加工作区</span>
                        </button>
                        <Transition name="menu">
                            <div
                                v-if="studio.state.openMenu === 'add'"
                                class="app-menu workspace-add-menu"
                                @click.capture="studio.dismissMenu">
                                <button class="app-menu-item" type="button" @click="studio.pickWorkspace">
                                    <span class="app-menu-icon"><AppIcon name="add-local-workspace" /></span>
                                    <span>本地工作区</span>
                                </button>
                                <button class="app-menu-item" type="button" @click="studio.showRemoteDialog()">
                                    <span class="app-menu-icon"><AppIcon name="add-remote-workspace" /></span>
                                    <span>远程工作区</span>
                                </button>
                            </div>
                        </Transition>
                    </div>
                </div>
            </div>
            <div class="workspace-list">
                <section
                    v-for="group in studio.workspaceGroupsWithEntries.value"
                    :key="group.id"
                    class="workspace-group">
                    <div class="workspace-group-header">
                        <button
                            class="workspace-group-toggle"
                            type="button"
                            :aria-expanded="!group.collapsed"
                            @click="studio.toggleWorkspaceGroup(group)">
                            <AppIcon :name="group.collapsed ? 'group-collapsed' : 'group-expanded'" />
                            <span>{{ group.name }}</span>
                            <small>{{ group.entries.length }}</small>
                        </button>
                        <div v-if="group.id !== studio.constants.DEFAULT_WORKSPACE_GROUP_ID" class="app-menu-wrap">
                            <button
                                class="workspace-group-action"
                                type="button"
                                @click="toggle($event, 'group', { path: group.id })">
                                <AppIcon name="more-actions" />
                            </button>
                            <Teleport to="body">
                                <Transition name="menu">
                                    <div
                                        v-if="studio.state.openMenu === menuKey('group', { path: group.id })"
                                        class="app-menu"
                                        :data-floating-menu="menuKey('group', { path: group.id })"
                                        :style="menuPosition"
                                        @click.capture="studio.dismissMenu"
                                        @click.stop>
                                        <button
                                            class="app-menu-item"
                                            type="button"
                                            @click="studio.showWorkspaceGroupDialog(group)">
                                            <span class="app-menu-icon"><AppIcon name="rename-workspace" /></span>
                                            <span>修改分组</span>
                                        </button>
                                        <button
                                            class="app-menu-item"
                                            type="button"
                                            @click="studio.requestDeleteWorkspaceGroup(group)">
                                            <span class="app-menu-icon"><AppIcon name="remove-workspace" /></span>
                                            <span>删除分组</span>
                                        </button>
                                    </div>
                                </Transition>
                            </Teleport>
                        </div>
                    </div>
                    <div v-if="!group.collapsed" class="workspace-group-entries">
                        <div
                            v-for="entry in group.entries"
                            :key="entry.path || studio.constants.HOME_WORKSPACE_KEY"
                            class="workspace-item"
                            :class="{
                                active: studio.state.selectedWorkspace === entry.path,
                                running: studio.projectForWorkspace(entry.path)
                            }"
                            @click="studio.selectWorkspace(entry.path)">
                            <button class="workspace-copy" type="button">
                                <span class="workspace-badge" aria-hidden="true">
                                    {{ workspaceInitial(entry.name) }}
                                </span>
                                <span class="workspace-text">
                                    <span class="workspace-name">{{ entry.name }}</span>
                                    <span class="workspace-path">{{ entry.detail }}</span>
                                </span>
                            </button>
                            <div class="workspace-actions" @click.stop>
                                <button
                                    v-if="entry.type === 'remote'"
                                    class="workspace-icon-btn open"
                                    type="button"
                                    @click="
                                        studio.openWebPage(entry.detail, {
                                            username: entry.username,
                                            password: entry.password
                                        })
                                    ">
                                    <AppIcon name="open-project" />
                                </button>
                                <template v-else-if="studio.projectForWorkspace(entry.path)">
                                    <button
                                        class="workspace-icon-btn open"
                                        type="button"
                                        @click="studio.openProject(studio.projectForWorkspace(entry.path))">
                                        <AppIcon name="open-project" />
                                    </button>
                                    <button
                                        class="workspace-icon-btn stop"
                                        type="button"
                                        @click="
                                            studio.stopWorkspace(
                                                entry.path,
                                                studio.projectForWorkspace(entry.path).mode
                                            )
                                        ">
                                        <AppIcon name="stop-workspace" />
                                    </button>
                                </template>
                                <div v-else class="app-menu-wrap">
                                    <button
                                        class="workspace-icon-btn run"
                                        :class="{
                                            loading: studio.startingWorkspaceKeys.has(studio.workspaceKey(entry.path))
                                        }"
                                        type="button"
                                        :disabled="
                                            studio.state.busy ||
                                            studio.startingWorkspaceKeys.has(studio.workspaceKey(entry.path))
                                        "
                                        @click="toggle($event, 'run', entry)">
                                        <Transition name="icon-swap" mode="out-in">
                                            <AppIcon
                                                :key="
                                                    studio.startingWorkspaceKeys.has(studio.workspaceKey(entry.path))
                                                        ? 'loading'
                                                        : 'start-workspace'
                                                "
                                                :name="
                                                    studio.startingWorkspaceKeys.has(studio.workspaceKey(entry.path))
                                                        ? 'loading'
                                                        : 'start-workspace'
                                                " />
                                        </Transition>
                                    </button>
                                    <Teleport to="body">
                                        <Transition name="menu">
                                            <div
                                                v-if="studio.state.openMenu === menuKey('run', entry)"
                                                class="app-menu run-target-menu"
                                                :data-floating-menu="menuKey('run', entry)"
                                                :style="menuPosition"
                                                @click.capture="studio.dismissMenu"
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
                                        </Transition>
                                    </Teleport>
                                </div>
                                <button
                                    v-if="entry.type !== 'remote'"
                                    class="workspace-icon-btn folder"
                                    type="button"
                                    @click="studio.revealWorkspace(entry.path)">
                                    <AppIcon name="open-folder" />
                                </button>
                                <div class="app-menu-wrap">
                                    <button
                                        class="workspace-icon-btn more"
                                        type="button"
                                        @click="toggle($event, 'more', entry)">
                                        <AppIcon name="more-actions" />
                                    </button>
                                    <Teleport to="body">
                                        <Transition name="menu">
                                            <div
                                                v-if="studio.state.openMenu === menuKey('more', entry)"
                                                class="app-menu"
                                                :data-floating-menu="menuKey('more', entry)"
                                                :style="menuPosition"
                                                @click.capture="studio.dismissMenu"
                                                @click.stop>
                                                <button
                                                    v-if="entry.path"
                                                    class="app-menu-item"
                                                    type="button"
                                                    @click="studio.togglePinned(entry.path)">
                                                    <span class="app-menu-icon">
                                                        <AppIcon
                                                            :name="
                                                                entry.pinned ? 'unpin-workspace' : 'pin-workspace'
                                                            " />
                                                    </span>
                                                    <span>{{ entry.pinned ? "取消置顶" : "置顶" }}</span>
                                                </button>
                                                <button
                                                    v-if="entry.removable && entry.type !== 'remote'"
                                                    class="app-menu-item"
                                                    type="button"
                                                    @click="studio.showAliasDialog(entry.path)">
                                                    <span class="app-menu-icon">
                                                        <AppIcon name="rename-workspace" />
                                                    </span>
                                                    <span>修改工作区信息</span>
                                                </button>
                                                <button
                                                    v-if="entry.type === 'remote'"
                                                    class="app-menu-item"
                                                    type="button"
                                                    @click="studio.showRemoteDialog(entry.path)">
                                                    <span class="app-menu-icon">
                                                        <AppIcon name="edit-remote-workspace" />
                                                    </span>
                                                    <span>修改工作区信息</span>
                                                </button>
                                                <button
                                                    v-if="entry.type === 'remote'"
                                                    class="app-menu-item"
                                                    type="button"
                                                    @click="
                                                        studio.openExternalUrl(entry.detail, {
                                                            username: entry.username,
                                                            password: entry.password
                                                        })
                                                    ">
                                                    <span class="app-menu-icon"><AppIcon name="open-external" /></span>
                                                    <span>使用系统浏览器打开</span>
                                                </button>
                                                <button
                                                    v-if="entry.type !== 'remote'"
                                                    class="app-menu-item"
                                                    type="button"
                                                    @click="studio.showLogsDialog(entry.path)">
                                                    <span class="app-menu-icon"><AppIcon name="view-logs" /></span>
                                                    <span>运行日志</span>
                                                </button>
                                                <button
                                                    v-if="entry.removable"
                                                    class="app-menu-item"
                                                    type="button"
                                                    @click="studio.showWorkspaceMoveDialog(entry)">
                                                    <span class="app-menu-icon"><AppIcon name="move-group" /></span>
                                                    <span>移动分组</span>
                                                </button>
                                                <button
                                                    v-if="entry.removable"
                                                    class="app-menu-item"
                                                    type="button"
                                                    @click="studio.removeWorkspace(entry.path)">
                                                    <span class="app-menu-icon">
                                                        <AppIcon name="remove-workspace" />
                                                    </span>
                                                    <span>移除工作区</span>
                                                </button>
                                            </div>
                                        </Transition>
                                    </Teleport>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    </div>
</template>
