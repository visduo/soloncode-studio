<script setup>
import { nextTick, onBeforeUnmount, reactive } from "vue";
import { useI18n } from "../i18n/index.js";
import { useStudioStore } from "../stores/studio.js";
import AppIcon from "./AppIcon.vue";
const studio = useStudioStore();
const { t } = useI18n();
const menuPosition = reactive({ left: "0px", top: "0px" });
let draggedWorkspace = null;
let draggedWorkspaceElement = null;
let workspaceDropTarget = null;
let workspacePointerStartX = 0;
let workspacePointerStartY = 0;
let suppressWorkspaceActivationUntil = 0;

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

function workspaceClick(entry) {
    if (performance.now() < suppressWorkspaceActivationUntil) return;
    studio.selectWorkspace(entry.path);
}

function workspaceDoubleClick(entry) {
    if (performance.now() < suppressWorkspaceActivationUntil) return;
    if (entry.type === "remote") {
        studio.openWebPage(entry.detail, { username: entry.username, password: entry.password });
        return;
    }
    studio.runWorkspace(entry.path, studio.state.preferences.defaultRunTarget);
}

function workspacePointerDown(event, entry, sourceGroupId) {
    if (event.button !== 0 || !entry.removable || !entry.path || event.target.closest(".workspace-actions")) return;
    draggedWorkspace = { path: entry.path, sourceGroupId };
    draggedWorkspaceElement = event.currentTarget;
    workspacePointerStartX = event.clientX;
    workspacePointerStartY = event.clientY;
    draggedWorkspaceElement.setPointerCapture(event.pointerId);
}

function findWorkspaceDropTarget(clientX, clientY) {
    return (
        document
            .elementsFromPoint(clientX, clientY)
            .map((element) => element.closest?.(".workspace-group-header[data-workspace-group-id]"))
            .find((element) => element && element.dataset.workspaceGroupId !== draggedWorkspace?.sourceGroupId) || null
    );
}

function workspacePointerMove(event) {
    if (!draggedWorkspaceElement || !draggedWorkspace) return;
    if (!draggedWorkspaceElement.classList.contains("dragging")) {
        const distance = Math.hypot(event.clientX - workspacePointerStartX, event.clientY - workspacePointerStartY);
        if (distance < 5) return;
        draggedWorkspaceElement.classList.add("dragging");
        studio.dismissMenu();
    }
    const target = findWorkspaceDropTarget(event.clientX, event.clientY);
    if (target === workspaceDropTarget) return;
    workspaceDropTarget?.classList.remove("drag-over");
    workspaceDropTarget = target;
    workspaceDropTarget?.classList.add("drag-over");
}

function clearWorkspaceDrag(pointerId) {
    if (draggedWorkspaceElement?.hasPointerCapture(pointerId)) draggedWorkspaceElement.releasePointerCapture(pointerId);
    draggedWorkspaceElement?.classList.remove("dragging");
    workspaceDropTarget?.classList.remove("drag-over");
    draggedWorkspace = null;
    draggedWorkspaceElement = null;
    workspaceDropTarget = null;
}

function finishWorkspaceDrag(event) {
    if (!draggedWorkspaceElement || !draggedWorkspace) return;
    const wasDragging = draggedWorkspaceElement.classList.contains("dragging");
    const path = draggedWorkspace.path;
    const sourceGroupId = draggedWorkspace.sourceGroupId;
    const targetGroupId = workspaceDropTarget?.dataset.workspaceGroupId;
    clearWorkspaceDrag(event.pointerId);
    if (!wasDragging) return;
    suppressWorkspaceActivationUntil = performance.now() + 300;
    if (targetGroupId) studio.moveWorkspace(path, targetGroupId, sourceGroupId);
}

function cancelWorkspaceDrag(event) {
    const wasDragging = draggedWorkspaceElement?.classList.contains("dragging");
    clearWorkspaceDrag(event.pointerId);
    if (wasDragging) suppressWorkspaceActivationUntil = performance.now() + 300;
}

onBeforeUnmount(() => {
    draggedWorkspaceElement?.classList.remove("dragging");
    workspaceDropTarget?.classList.remove("drag-over");
});
</script>

<template>
    <div class="main-panel">
        <div class="workspace-content">
            <div class="welcome-toolbar">
                <label class="workspace-search">
                    <span class="workspace-search-icon"><i class="ri-search-line"></i></span>
                    <input v-model="studio.state.workspaceSearch" type="search" :placeholder="t('workspace.search')" />
                </label>
                <div class="welcome-actions">
                    <button
                        class="welcome-action primary workspace-add-trigger"
                        type="button"
                        @click="studio.showWorkspaceGroupDialog">
                        <span class="welcome-action-icon"><AppIcon name="add-group" /></span>
                        <span>{{ t("workspace.createGroup") }}</span>
                    </button>
                    <div class="app-menu-wrap workspace-add-menu-wrap">
                        <button
                            class="welcome-action primary workspace-add-trigger"
                            type="button"
                            @click="toggleAddMenu">
                            <span class="welcome-action-icon"><AppIcon name="add-workspace" /></span>
                            <span>{{ t("workspace.add") }}</span>
                        </button>
                        <Transition name="menu">
                            <div
                                v-if="studio.state.openMenu === 'add'"
                                class="app-menu workspace-add-menu"
                                @click.capture="studio.dismissMenu">
                                <button class="app-menu-item" type="button" @click="studio.pickWorkspace">
                                    <span class="app-menu-icon"><AppIcon name="add-local-workspace" /></span>
                                    <span>{{ t("workspace.local") }}</span>
                                </button>
                                <button class="app-menu-item" type="button" @click="studio.showRemoteDialog()">
                                    <span class="app-menu-icon"><AppIcon name="add-remote-workspace" /></span>
                                    <span>{{ t("workspace.remote") }}</span>
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
                    <div class="workspace-group-header" :data-workspace-group-id="group.id">
                        <button
                            class="workspace-group-toggle"
                            type="button"
                            :aria-expanded="!group.collapsed"
                            @click="studio.toggleWorkspaceGroup(group)">
                            <AppIcon :name="group.collapsed ? 'group-collapsed' : 'group-expanded'" />
                            <span>
                                {{
                                    group.id === studio.constants.DEFAULT_WORKSPACE_GROUP_ID
                                        ? t("workspace.defaultGroup")
                                        : group.name
                                }}
                                <small>（{{ t("workspace.count", { count: group.entries.length }) }}）</small>
                            </span>
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
                                            <span>{{ t("workspace.editGroup") }}</span>
                                        </button>
                                        <button
                                            class="app-menu-item"
                                            type="button"
                                            @click="studio.requestDeleteWorkspaceGroup(group)">
                                            <span class="app-menu-icon"><AppIcon name="remove-workspace" /></span>
                                            <span>{{ t("workspace.deleteGroup") }}</span>
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
                            :data-workspace-draggable="Boolean(entry.removable && entry.path)"
                            :class="{
                                active: studio.state.selectedWorkspace === entry.path,
                                running:
                                    studio.projectForWorkspace(entry.path) &&
                                    !studio.startingWorkspaceKeys.has(studio.workspaceKey(entry.path))
                            }"
                            @click="workspaceClick(entry)"
                            @dblclick="workspaceDoubleClick(entry)"
                            @pointerdown="workspacePointerDown($event, entry, group.id)"
                            @pointermove="workspacePointerMove"
                            @pointerup="finishWorkspaceDrag"
                            @pointercancel="cancelWorkspaceDrag"
                            @lostpointercapture="cancelWorkspaceDrag">
                            <button class="workspace-copy" type="button">
                                <span class="workspace-badge" aria-hidden="true">
                                    {{ workspaceInitial(entry.name) }}
                                </span>
                                <span class="workspace-text">
                                    <span class="workspace-name">{{ entry.name }}</span>
                                    <span class="workspace-path">{{ entry.detail }}</span>
                                </span>
                            </button>
                            <div class="workspace-actions" @click.stop @dblclick.stop>
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
                                <template
                                    v-else-if="
                                        studio.projectForWorkspace(entry.path) &&
                                        !studio.startingWorkspaceKeys.has(studio.workspaceKey(entry.path))
                                    ">
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
                                        v-if="studio.startingWorkspaceKeys.has(studio.workspaceKey(entry.path))"
                                        class="workspace-icon-btn is-loading"
                                        type="button"
                                        disabled>
                                        <AppIcon name="loading" />
                                    </button>
                                    <button
                                        v-else
                                        class="workspace-icon-btn run"
                                        type="button"
                                        :disabled="studio.state.busy"
                                        @click="toggle($event, 'run', entry)">
                                        <AppIcon name="start-workspace" />
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
                                                    {{ t(target.labelKey) }}
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
                                                    <span>
                                                        {{ t(entry.pinned ? "workspace.unpin" : "workspace.pin") }}
                                                    </span>
                                                </button>
                                                <button
                                                    v-if="entry.removable && entry.type !== 'remote'"
                                                    class="app-menu-item"
                                                    type="button"
                                                    @click="studio.showAliasDialog(entry.path)">
                                                    <span class="app-menu-icon">
                                                        <AppIcon name="rename-workspace" />
                                                    </span>
                                                    <span>{{ t("workspace.edit") }}</span>
                                                </button>
                                                <button
                                                    v-if="entry.type === 'remote'"
                                                    class="app-menu-item"
                                                    type="button"
                                                    @click="studio.showRemoteDialog(entry.path)">
                                                    <span class="app-menu-icon">
                                                        <AppIcon name="edit-remote-workspace" />
                                                    </span>
                                                    <span>{{ t("workspace.edit") }}</span>
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
                                                    <span>{{ t("workspace.openExternal") }}</span>
                                                </button>
                                                <button
                                                    v-if="entry.type !== 'remote'"
                                                    class="app-menu-item"
                                                    type="button"
                                                    @click="studio.showLogsDialog(entry.path)">
                                                    <span class="app-menu-icon"><AppIcon name="view-logs" /></span>
                                                    <span>{{ t("workspace.logs") }}</span>
                                                </button>
                                                <button
                                                    v-if="entry.removable"
                                                    class="app-menu-item"
                                                    type="button"
                                                    @click="studio.showWorkspaceMoveDialog(entry)">
                                                    <span class="app-menu-icon"><AppIcon name="move-group" /></span>
                                                    <span>{{ t("workspace.move") }}</span>
                                                </button>
                                                <button
                                                    v-if="entry.removable"
                                                    class="app-menu-item"
                                                    type="button"
                                                    @click="studio.removeWorkspace(entry.path)">
                                                    <span class="app-menu-icon">
                                                        <AppIcon name="remove-workspace" />
                                                    </span>
                                                    <span>{{ t("workspace.remove") }}</span>
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
