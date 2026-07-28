<script setup>
import { useStudioStore } from "../stores/studio.js";
import AppIcon from "./AppIcon.vue";

const studio = useStudioStore();
</script>

<template>
    <div class="environment-panel">
        <header class="environment-header">
            <div>
                <h1>环境管理</h1>
                <p>查看并管理 SolonCode Studio/CLI 版本信息及 SolonCode 运行时所需的依赖。</p>
            </div>
            <button
                class="environment-refresh"
                type="button"
                :disabled="studio.state.busy || studio.state.environmentChecking"
                @click="studio.refreshEnvironment()">
                <AppIcon name="refresh" :class="{ spinning: studio.state.environmentChecking }" />
                <span>{{ studio.state.environmentChecking ? "检测中" : "重新检测" }}</span>
            </button>
        </header>

        <p v-if="studio.state.environmentError" class="environment-error">
            {{ studio.state.environmentError }}
        </p>

        <div class="environment-list">
            <section class="environment-item">
                <div class="environment-item-main">
                    <div>
                        <h2>SolonCode Studio</h2>
                        <p>桌面工作台，你的“数字员工”</p>
                    </div>
                </div>
                <dl class="environment-versions">
                    <div>
                        <dt>当前版本</dt>
                        <dd>{{ studio.state.studioVersion }}</dd>
                    </div>
                    <div>
                        <dt>最新版本</dt>
                        <dd>{{ studio.state.studioLatestVersion || "未知" }}</dd>
                    </div>
                </dl>
                <div class="environment-controls">
                    <div class="environment-status">
                        <span class="environment-detail-label">状态</span>
                        <span
                            class="environment-detail-value"
                            :class="{ 'environment-update': studio.state.studioUpdateAvailable }">
                            {{
                                !studio.state.studioLatestVersion
                                    ? "未知"
                                    : studio.state.studioUpdateAvailable
                                      ? "有可用更新"
                                      : "已是最新版本"
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
                            <span>更新</span>
                        </button>
                    </div>
                </div>
            </section>

            <section class="environment-item">
                <div class="environment-item-main">
                    <div>
                        <h2>SolonCode CLI</h2>
                        <p>负责启动工作区与执行任务</p>
                    </div>
                </div>
                <dl class="environment-versions">
                    <div>
                        <dt>当前版本</dt>
                        <dd>{{ studio.state.cliVersion || (studio.state.installed ? "未知" : "未安装") }}</dd>
                    </div>
                    <div>
                        <dt>最新版本</dt>
                        <dd>{{ studio.state.cliLatestVersion || "未知" }}</dd>
                    </div>
                </dl>
                <div class="environment-controls">
                    <div class="environment-status">
                        <span class="environment-detail-label">状态</span>
                        <span
                            class="environment-detail-value"
                            :class="{ 'environment-update': studio.state.cliUpdateAvailable }">
                            {{
                                !studio.state.installed
                                    ? "未安装"
                                    : !studio.state.cliLatestVersion
                                      ? "未知"
                                      : studio.state.cliUpdateAvailable
                                        ? "有可用更新"
                                        : "已安装"
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
                            <span>{{ studio.state.installed ? "更新" : "安装" }}</span>
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
                            <span>卸载</span>
                        </button>
                    </div>
                </div>
            </section>

            <section class="environment-item environment-item-java">
                <div class="environment-item-main">
                    <div>
                        <h2>Java 运行环境</h2>
                        <p>SolonCode 安装和运行所需的基础环境</p>
                    </div>
                </div>
                <dl class="environment-versions">
                    <div>
                        <dt>当前版本</dt>
                        <dd>{{ studio.state.javaVersion || "未知" }}</dd>
                    </div>
                    <div>
                        <dt>推荐版本</dt>
                        <dd>1.8～26</dd>
                    </div>
                </dl>
                <div class="environment-controls">
                    <div class="environment-status">
                        <span class="environment-detail-label">状态</span>
                        <span
                            class="environment-detail-value"
                            :class="{ 'environment-missing': !studio.state.javaAvailable }">
                            {{ studio.state.javaAvailable ? "可用" : "未知" }}
                        </span>
                    </div>
                    <div class="environment-actions">
                        <button
                            class="environment-action primary"
                            type="button"
                            :disabled="studio.state.environmentChecking || studio.state.javaAvailable"
                            @click="studio.openExternalUrl('https://www.flyenv.com/zh/download.html')">
                            <AppIcon name="install-java" />
                            <span>安装</span>
                        </button>
                    </div>
                </div>
            </section>
        </div>
    </div>
</template>
