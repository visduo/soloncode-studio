<script setup>
import { useStudioStore } from "../stores/studio.js";
import AppIcon from "./AppIcon.vue";
const studio = useStudioStore();

function releaseMenuFocus(event) {
    event.target.closest("button")?.blur();
    queueMicrotask(() => {
        studio.state.openMenu = null;
    });
}
</script>

<template>
    <section class="sidebar">
        <div class="welcome-brand">
            <img class="welcome-logo" src="../assets/media/logo.png" alt="" />
            <span class="welcome-brand-copy">
                <strong>SolonCode Studio</strong>
                <small>
                    <span class="version-item" :class="{ 'version-update': studio.state.studioUpdateAvailable }">
                        {{ studio.state.studioVersion }}
                    </span>
                </small>
            </span>
        </div>
        <div class="welcome-nav">
            <button
                class="welcome-nav-item"
                :class="{ active: studio.state.homeSection === 'workspace' }"
                type="button"
                @click="studio.state.homeSection = 'workspace'">
                <span class="welcome-nav-icon"><AppIcon name="workspaces" /></span>
                <span>工作区</span>
            </button>
            <button
                class="welcome-nav-item"
                :class="{ active: studio.state.homeSection === 'learning' }"
                type="button"
                @click="studio.state.homeSection = 'learning'">
                <span class="welcome-nav-icon"><AppIcon name="learning" /></span>
                <span>学习</span>
            </button>
        </div>
        <div class="sidebar-cli">
            <div class="app-menu-wrap sidebar-cli-menu-wrap">
                <button
                    class="sidebar-cli-settings"
                    type="button"
                    @click="studio.state.openMenu = studio.state.openMenu === 'cli' ? null : 'cli'">
                    <AppIcon name="cli-settings" />
                </button>
                <div
                    v-if="studio.state.openMenu === 'cli'"
                    class="app-menu cli-actions-menu"
                    @click.capture="releaseMenuFocus">
                    <button
                        v-if="!studio.state.javaAvailable"
                        class="app-menu-item"
                        type="button"
                        @click="studio.openExternalUrl('https://www.flyenv.com/zh/download.html')">
                        <span class="app-menu-icon"><AppIcon name="install-java" /></span>
                        <span>安装 Java</span>
                    </button>
                    <button
                        class="app-menu-item"
                        type="button"
                        :disabled="!studio.state.studioUpdateAvailable"
                        @click="studio.openExternalUrl('https://soloncode.studio/')">
                        <span class="app-menu-icon"><AppIcon name="update-studio" /></span>
                        <span>更新 Studio</span>
                    </button>
                    <button
                        class="app-menu-item"
                        type="button"
                        :disabled="studio.state.busy || (studio.state.installed && !studio.state.cliUpdateAvailable)"
                        @click="studio.handleCliPrimaryAction">
                        <span class="app-menu-icon">
                            <AppIcon :name="studio.state.installed ? 'update-cli' : 'install-cli'" />
                        </span>
                        <span>{{ studio.state.installed ? "更新 CLI" : "安装 CLI" }}</span>
                    </button>
                    <button
                        class="app-menu-item cli-uninstall-item"
                        type="button"
                        :disabled="studio.state.busy || !studio.state.installed || studio.projects.size > 0"
                        @click="studio.handleUninstall">
                        <span class="app-menu-icon"><AppIcon name="uninstall-cli" /></span>
                        <span>卸载 CLI</span>
                    </button>
                </div>
            </div>
        </div>
    </section>
</template>
