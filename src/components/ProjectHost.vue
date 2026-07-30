<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { withStudioParam } from "../assets/js/url.js";
import { useI18n } from "../i18n/index.js";
import { useStudioStore } from "../stores/studio.js";
import TerminalView from "./TerminalView.vue";
const studio = useStudioStore();
const { t } = useI18n();
const readyFrames = ref(new Set());
const frameReadyTimers = new Map();

function markFrameReady(projectKey) {
    window.clearTimeout(frameReadyTimers.get(projectKey));
    frameReadyTimers.delete(projectKey);
    readyFrames.value = new Set(readyFrames.value).add(projectKey);
}

function prepareFrame(project) {
    const frames = new Set(readyFrames.value);
    frames.delete(project.project_key);
    readyFrames.value = frames;
    window.clearTimeout(frameReadyTimers.get(project.project_key));
    frameReadyTimers.set(
        project.project_key,
        window.setTimeout(() => markFrameReady(project.project_key), 1500)
    );
}

function frameLoaded(event, project) {
    sendThemeToFrame(event.currentTarget);
    markFrameReady(project.project_key);
}

function frameOrigin(frame) {
    try {
        return new URL(frame.src).origin;
    } catch (_) {
        return "*";
    }
}

function sendThemeToFrame(frame) {
    frame?.contentWindow?.postMessage(
        {
            type: "studio-theme-sync",
            source: "soloncode-studio",
            payload: {
                theme: studio.state.resolvedThemeMode
            }
        },
        frameOrigin(frame)
    );
}

function broadcastThemeToFrames() {
    document.querySelectorAll(".project-frame").forEach(sendThemeToFrame);
}

function projectFrameBySource(source) {
    for (const project of studio.hostedProjects.value) {
        const frame = document.querySelector(`[data-project-key="${CSS.escape(project.project_key)}"] iframe`);
        if (frame?.contentWindow === source) return { project, frame };
    }
    return null;
}
async function message(event) {
    const data = event.data;
    if (!data?.type || data.source !== "soloncode-cli") return;
    const match = projectFrameBySource(event.source);
    if (!match) return;
    const { project, frame } = match;
    const sourceOrigin = frameOrigin(frame);
    if (sourceOrigin !== "*" && event.origin !== sourceOrigin) return;
    if (data.type === "studio-blocked-navigation" && data.payload?.url) return studio.openExternalUrl(data.payload.url);
    if (data.type === "soloncode-theme-ready") {
        sendThemeToFrame(frame);
        window.setTimeout(() => markFrameReady(project.project_key), 50);
        return;
    }
    if (data.type === "soloncode-theme-change") {
        const theme = data.payload?.theme;
        if ((theme === "light" || theme === "dark") && theme !== studio.state.resolvedThemeMode)
            studio.synchronizeThemeMode(theme);
        return;
    }
    if (data.type === "soloncode-frame-context-action") {
        const action = data.payload?.action;
        if (action === "refresh") {
            frame.src = withStudioParam(project.url);
        }
        if (action === "open-external") await studio.openExternalUrl(project.url);
        if (action === "open-devtools" && studio.constants.IS_DEVELOPMENT_MODE) await studio.invoke("open_devtools");
        if (action === "open-workspace" && project.type !== studio.constants.PROJECT_TYPES.webPage)
            await studio.revealWorkspace(project.workspace);
    }
    if (data.type === "soloncode-frame-context-request")
        event.source.postMessage(
            {
                type: "soloncode-frame-context-response",
                source: "soloncode-studio",
                payload: {
                    requestId: data.payload?.requestId,
                    context: {
                        localWorkspace: project.type !== studio.constants.PROJECT_TYPES.webPage,
                        developmentMode: studio.constants.IS_DEVELOPMENT_MODE,
                        labels: {
                            copy: t("context.copy"),
                            paste: t("context.paste"),
                            refresh: t("context.refresh"),
                            external: t("context.openExternal"),
                            folder: t("context.openWorkspace"),
                            devtools: t("context.openDevtools")
                        }
                    }
                }
            },
            event.origin
        );
    if (data.type === "studio-task-lifecycle" && data.payload?.sessionId) {
        const sessions = new Map(studio.taskSessions.get(project.project_key) || []);
        if (data.payload.action === "start") sessions.set(data.payload.sessionId, data.payload);
        else if (data.payload.action === "end") {
            const previous = sessions.get(data.payload.sessionId);
            sessions.delete(data.payload.sessionId);
            if (
                previous &&
                (studio.state.activeTabKey !== project.project_key ||
                    document.visibilityState === "hidden" ||
                    !document.hasFocus())
            )
                await studio.invoke("show_task_finished_notification", {
                    title: t("notification.taskFinished"),
                    body: `${project.name} - ${data.payload.taskName || previous.taskName || t("notification.task")}`
                });
        }
        if (sessions.size) studio.taskSessions.set(project.project_key, sessions);
        else studio.taskSessions.delete(project.project_key);
    }
}
watch(() => studio.state.resolvedThemeMode, broadcastThemeToFrames, { flush: "post" });
onMounted(() => window.addEventListener("message", message));
onBeforeUnmount(() => {
    window.removeEventListener("message", message);
    frameReadyTimers.forEach((timer) => window.clearTimeout(timer));
});
</script>

<template>
    <section class="project-view">
        <div
            v-for="project in studio.hostedProjects.value"
            v-show="studio.state.activeTabKey === project.project_key"
            :key="project.project_key"
            class="vue-project-host"
            :data-project-key="project.project_key">
            <TerminalView
                v-if="project.mode === studio.constants.LAUNCH_MODES.cli"
                :project="project"
                :active="studio.state.activeTabKey === project.project_key" />
            <iframe
                v-else
                class="project-frame"
                :class="{
                    'web-page-frame': project.type === studio.constants.PROJECT_TYPES.webPage,
                    'frame-loading': !readyFrames.has(project.project_key)
                }"
                :src="withStudioParam(project.url)"
                @vue:mounted="prepareFrame(project)"
                @load="frameLoaded($event, project)"
                :referrerpolicy="project.type === studio.constants.PROJECT_TYPES.webPage ? 'no-referrer' : undefined"
                :allow="
                    project.type === studio.constants.PROJECT_TYPES.webPage
                        ? 'fullscreen; clipboard-read; clipboard-write *; microphone *; on-device-speech-recognition *; pointer-lock'
                        : 'clipboard-read *; clipboard-write *; microphone *; on-device-speech-recognition *; pointer-lock'
                "></iframe>
        </div>
    </section>
</template>
