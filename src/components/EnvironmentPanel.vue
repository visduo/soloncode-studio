<script setup>
import { useI18n } from "../i18n/index.js";
import { useStudioStore } from "../stores/studio.js";
import AppIcon from "./AppIcon.vue";

const studio = useStudioStore();
const { t } = useI18n();
</script>

<template>
    <div class="environment-panel">
        <header class="environment-header">
            <div>
                <h1>{{ t("environment.title") }}</h1>
                <p>{{ t("environment.description") }}</p>
            </div>
            <button
                class="environment-refresh"
                type="button"
                :disabled="studio.state.busy || studio.state.environmentChecking"
                @click="studio.refreshEnvironment()">
                <AppIcon name="refresh" :class="{ spinning: studio.state.environmentChecking }" />
                <span>{{ t(studio.state.environmentChecking ? "environment.checking" : "environment.recheck") }}</span>
            </button>
        </header>

        <div class="environment-list">
            <section class="environment-item">
                <div class="environment-item-main">
                    <div>
                        <h2>SolonCode Studio</h2>
                        <p>{{ t("environment.studioDescription") }}</p>
                    </div>
                </div>
                <dl class="environment-versions">
                    <div>
                        <dt>{{ t("environment.currentVersion") }}</dt>
                        <dd>{{ studio.state.studioVersion }}</dd>
                    </div>
                    <div>
                        <dt>{{ t("environment.latestVersion") }}</dt>
                        <dd>{{ studio.state.studioLatestVersion || t("common.unknown") }}</dd>
                    </div>
                </dl>
                <div class="environment-controls">
                    <div class="environment-status">
                        <span class="environment-detail-label">{{ t("environment.status") }}</span>
                        <span
                            class="environment-detail-value"
                            :class="{ 'environment-update': studio.state.studioUpdateAvailable }">
                            {{
                                !studio.state.studioLatestVersion
                                    ? t("common.unknown")
                                    : studio.state.studioUpdateAvailable
                                      ? t("common.updateAvailable")
                                      : t("environment.latest")
                            }}
                        </span>
                    </div>
                    <div class="environment-actions">
                        <button
                            class="environment-action primary"
                            type="button"
                            :disabled="studio.state.environmentChecking || !studio.state.studioUpdateAvailable"
                            @click="studio.openExternalUrl('https://soloncode.studio/')">
                            <AppIcon name="update-studio" />
                            <span>{{ t("common.update") }}</span>
                        </button>
                    </div>
                </div>
            </section>

            <section class="environment-item">
                <div class="environment-item-main">
                    <div>
                        <h2>SolonCode CLI</h2>
                        <p>{{ t("environment.cliDescription") }}</p>
                    </div>
                </div>
                <dl class="environment-versions">
                    <div>
                        <dt>{{ t("environment.currentVersion") }}</dt>
                        <dd>
                            {{
                                studio.state.cliVersion ||
                                t(studio.state.installed ? "common.unknown" : "common.notInstalled")
                            }}
                        </dd>
                    </div>
                    <div>
                        <dt>{{ t("environment.latestVersion") }}</dt>
                        <dd>{{ studio.state.cliLatestVersion || t("common.unknown") }}</dd>
                    </div>
                </dl>
                <div class="environment-controls">
                    <div class="environment-status">
                        <span class="environment-detail-label">{{ t("environment.status") }}</span>
                        <span
                            class="environment-detail-value"
                            :class="{ 'environment-update': studio.state.cliUpdateAvailable }">
                            {{
                                !studio.state.installed
                                    ? t("common.notInstalled")
                                    : !studio.state.cliLatestVersion
                                      ? t("common.unknown")
                                      : studio.state.cliUpdateAvailable
                                        ? t("common.updateAvailable")
                                        : t("common.installed")
                            }}
                        </span>
                    </div>
                    <div class="environment-actions">
                        <button
                            class="environment-action primary"
                            type="button"
                            :disabled="
                                studio.state.busy ||
                                studio.state.environmentChecking ||
                                (studio.state.installed && !studio.state.cliUpdateAvailable)
                            "
                            @click="studio.handleCliPrimaryAction">
                            <AppIcon :name="studio.state.installed ? 'update-cli' : 'install-cli'" />
                            <span>{{ t(studio.state.installed ? "common.update" : "common.install") }}</span>
                        </button>
                        <button
                            class="environment-action danger"
                            type="button"
                            :disabled="
                                studio.state.busy ||
                                studio.state.environmentChecking ||
                                !studio.state.installed ||
                                studio.projects.size > 0
                            "
                            @click="studio.handleUninstall">
                            <AppIcon name="uninstall-cli" />
                            <span>{{ t("common.uninstall") }}</span>
                        </button>
                    </div>
                </div>
            </section>

            <section class="environment-item environment-item-java">
                <div class="environment-item-main">
                    <div>
                        <h2>{{ t("environment.java") }}</h2>
                        <p>{{ t("environment.javaDescription") }}</p>
                    </div>
                </div>
                <dl class="environment-versions">
                    <div>
                        <dt>{{ t("environment.currentVersion") }}</dt>
                        <dd>{{ studio.state.javaVersion || t("common.unknown") }}</dd>
                    </div>
                    <div>
                        <dt>{{ t("environment.recommendedVersion") }}</dt>
                        <dd>1.8～26</dd>
                    </div>
                </dl>
                <div class="environment-controls">
                    <div class="environment-status">
                        <span class="environment-detail-label">{{ t("environment.status") }}</span>
                        <span
                            class="environment-detail-value"
                            :class="{ 'environment-missing': !studio.state.javaAvailable }">
                            {{ t(studio.state.javaAvailable ? "environment.available" : "common.unknown") }}
                        </span>
                    </div>
                    <div class="environment-actions">
                        <button
                            class="environment-action primary"
                            type="button"
                            :disabled="studio.state.environmentChecking || studio.state.javaAvailable"
                            @click="studio.openExternalUrl('https://www.flyenv.com/zh/download.html')">
                            <AppIcon name="install-java" />
                            <span>{{ t("common.install") }}</span>
                        </button>
                    </div>
                </div>
            </section>
        </div>
    </div>
</template>
