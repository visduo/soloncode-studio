<script setup>
import { onBeforeUnmount, onMounted } from "vue";
import { withStudioParam } from "../assets/js/url.js";
import { useStudioStore } from "../stores/studio.js";
import TerminalView from "./TerminalView.vue";
const studio = useStudioStore();

function projectFrameBySource(source) {
    for (const project of studio.orderedProjects.value) {
        const frame = document.querySelector(`[data-project-key="${CSS.escape(project.project_key)}"] iframe`);
        if (frame?.contentWindow === source) return { project, frame };
    }
    return null;
}
async function message(event) {
    const data = event.data;
    if (!data?.type) return;
    if (data.type === "studio-blocked-navigation") return studio.openExternalUrl(data.payload.url);
    const match = projectFrameBySource(event.source);
    if (!match) return;
    const { project, frame } = match;
    if (data.type === "soloncode-frame-context-action") {
        if (data.action === "refresh") {
            frame.src = withStudioParam(project.url);
        }
        if (data.action === "open-external") await studio.openExternalUrl(project.url);
        if (data.action === "open-devtools" && studio.constants.IS_DEVELOPMENT_MODE)
            await studio.invoke("open_devtools");
        if (data.action === "open-workspace" && project.type !== studio.constants.PROJECT_TYPES.webPage)
            await studio.revealWorkspace(project.workspace);
    }
    if (data.type === "soloncode-frame-context-request")
        event.source.postMessage(
            {
                type: "soloncode-frame-context-response",
                requestId: data.requestId,
                context: {
                    localWorkspace: project.type !== studio.constants.PROJECT_TYPES.webPage,
                    developmentMode: studio.constants.IS_DEVELOPMENT_MODE
                }
            },
            "*"
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
                    title: "任务完成",
                    body: `${project.name} - ${data.payload.taskName || previous.taskName || "任务"}`
                });
        }
        if (sessions.size) studio.taskSessions.set(project.project_key, sessions);
        else studio.taskSessions.delete(project.project_key);
    }
}
onMounted(() => window.addEventListener("message", message));
onBeforeUnmount(() => window.removeEventListener("message", message));
</script>

<template>
    <section class="project-view">
        <div
            v-for="project in studio.orderedProjects.value"
            :key="project.project_key"
            class="vue-project-host"
            :data-project-key="project.project_key"
            v-show="studio.state.activeTabKey === project.project_key">
            <TerminalView
                v-if="project.mode === studio.constants.LAUNCH_MODES.cli"
                :project="project"
                :active="studio.state.activeTabKey === project.project_key" />
            <iframe
                v-else
                class="project-frame"
                :class="{ 'web-page-frame': project.type === studio.constants.PROJECT_TYPES.webPage }"
                :src="withStudioParam(project.url)"
                :referrerpolicy="project.type === studio.constants.PROJECT_TYPES.webPage ? 'no-referrer' : undefined"
                :allow="
                    project.type === studio.constants.PROJECT_TYPES.webPage
                        ? 'fullscreen; clipboard-read; clipboard-write *; microphone *; on-device-speech-recognition *; pointer-lock'
                        : 'clipboard-read *; clipboard-write *; microphone *; on-device-speech-recognition *; pointer-lock'
                "></iframe>
        </div>
    </section>
</template>
