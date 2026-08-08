<script setup>
import { useI18n } from '../i18n/index.js';
import { useStudioStore } from '../stores/studio.js';
import AppIcon from './AppIcon.vue';
const studio = useStudioStore();
const { t } = useI18n();
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
        @click="studio.activateHomeSection('workspace')"
      >
        <span class="welcome-nav-icon"><AppIcon name="workspaces" /></span>
        <span>{{ t('nav.workspaces') }}</span>
      </button>
      <button
        class="welcome-nav-item"
        :class="{ active: studio.state.homeSection === 'learning' }"
        type="button"
        @click="studio.activateHomeSection('learning')"
      >
        <span class="welcome-nav-icon"><AppIcon name="learning" /></span>
        <span>{{ t('nav.learning') }}</span>
      </button>
      <button
        class="welcome-nav-item"
        :class="{ active: studio.state.homeSection === 'environment' }"
        type="button"
        @click="studio.activateHomeSection('environment')"
      >
        <span class="welcome-nav-icon"><AppIcon name="environment" /></span>
        <span>{{ t('nav.environment') }}</span>
      </button>
      <button
        class="welcome-nav-item"
        :class="{ active: studio.state.homeSection === 'settings' }"
        type="button"
        @click="studio.activateHomeSection('settings')"
      >
        <span class="welcome-nav-icon"><AppIcon name="settings" /></span>
        <span>{{ t('nav.settings') }}</span>
      </button>
    </div>
  </section>
</template>
