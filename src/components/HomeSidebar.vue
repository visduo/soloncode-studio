<script setup>
import { useStudioStore } from "../stores/studio.js";
import AppIcon from "./AppIcon.vue";
const studio = useStudioStore();
</script>

<template>
    <section class="sidebar">
        <div class="welcome-brand">
            <img class="welcome-logo" src="../assets/media/logo.png" alt="" />
            <span class="welcome-brand-copy">
                <strong>SolonCode Studio</strong>
                <small>
                    <Transition name="status-text" mode="out-in">
                        <span :key="studio.state.studioVersion" class="version-item">
                            {{ studio.state.studioVersion }}
                        </span>
                    </Transition>
                </small>
            </span>
        </div>
        <div class="welcome-nav">
            <button
                class="welcome-nav-item"
                :class="{ active: studio.state.homeSection === 'workspace' }"
                type="button"
                @click="studio.activateHomeSection('workspace')">
                <span class="welcome-nav-icon"><AppIcon name="workspaces" /></span>
                <span>工作区</span>
            </button>
            <button
                class="welcome-nav-item"
                :class="{ active: studio.state.homeSection === 'learning' }"
                type="button"
                @click="studio.activateHomeSection('learning')">
                <span class="welcome-nav-icon"><AppIcon name="learning" /></span>
                <span>学习</span>
            </button>
            <button
                class="welcome-nav-item"
                :class="{ active: studio.state.homeSection === 'environment' }"
                type="button"
                @click="studio.activateHomeSection('environment')">
                <span class="welcome-nav-icon"><AppIcon name="environment" /></span>
                <span>环境</span>
            </button>
            <button
                class="welcome-nav-item"
                :class="{ active: studio.state.homeSection === 'settings' }"
                type="button"
                @click="studio.activateHomeSection('settings')">
                <span class="welcome-nav-icon"><AppIcon name="settings" /></span>
                <span>设置</span>
            </button>
        </div>
    </section>
</template>
