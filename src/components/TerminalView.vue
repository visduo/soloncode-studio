<script setup>
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
    getLastTerminalInputChar,
    getTerminalCharWidth,
    isTerminalControlSequence,
    removeLastTerminalInputChar
} from "../assets/js/terminal-input.js";
import { useStudioStore } from "../stores/studio.js";

const props = defineProps({ project: { type: Object, required: true }, active: Boolean });
const studio = useStudioStore();
const host = ref(null);
let terminal;
let fitAddon;
let webglAddon;
let commandBuffer = "";
let renderedOutput = "";
const isLinux = !/Mac|iPhone|iPad|Win/.test(navigator.platform);

function fit() {
    nextTick(() => {
        try {
            fitAddon?.fit();
            terminal?.refresh(0, terminal.rows - 1);
        } catch (_) {}
    });
}
function writeSnapshot(output = "") {
    if (!terminal || renderedOutput === output) return;
    if (output.startsWith(renderedOutput)) terminal.write(output.slice(renderedOutput.length).replace(/\n/g, "\r\n"));
    else {
        terminal.reset();
        terminal.write(output.replace(/\n/g, "\r\n"));
        if (commandBuffer) terminal.write(commandBuffer);
    }
    renderedOutput = output;
}
function onData(data) {
    if (isTerminalControlSequence(data)) {
        if (data === "\u0003") {
            commandBuffer = "";
            terminal.write("^C\r\n");
        }
        studio.sendCliInput(props.project.project_key, data);
        return;
    }
    for (const char of data) {
        if (char === "\r") {
            const input = commandBuffer;
            commandBuffer = "";
            terminal.write("\r\n");
            if (input.trim()) studio.sendCliInput(props.project.project_key, input);
        } else if (char === "\u007f") {
            const last = getLastTerminalInputChar(commandBuffer);
            if (last) {
                commandBuffer = removeLastTerminalInputChar(commandBuffer);
                terminal.write("\b \b".repeat(getTerminalCharWidth(last)));
            }
        } else if (char >= " " || char === "\t") {
            commandBuffer += char;
            terminal.write(char);
        }
    }
}
function applySettings() {
    if (!terminal) return;
    const settings = studio.state.terminalSettings;
    terminal.options.fontFamily = settings.fontFamily;
    terminal.options.fontSize = settings.fontSize;
    terminal.options.lineHeight = settings.lineHeight;
    terminal.options.theme = {
        background: settings.background,
        foreground: settings.foreground,
        cursor: settings.cursor,
        selectionBackground: "#315f91"
    };
    fit();
}
function resize() {
    if (props.active) fit();
}

onMounted(() => {
    const settings = studio.state.terminalSettings;
    terminal = new Terminal({
        convertEol: true,
        cursorBlink: true,
        scrollback: 2000,
        fontFamily: settings.fontFamily,
        fontSize: settings.fontSize,
        lineHeight: settings.lineHeight,
        theme: {
            background: settings.background,
            foreground: settings.foreground,
            cursor: settings.cursor,
            selectionBackground: "#315f91"
        }
    });
    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host.value);
    if (!isLinux) {
        try {
            webglAddon = new WebglAddon();
            webglAddon.onContextLoss?.(() => webglAddon.dispose());
            terminal.loadAddon(webglAddon);
        } catch (_) {
            webglAddon = null;
        }
    }
    terminal.onData(onData);
    writeSnapshot(props.project.terminal_output || "");
    fit();
    window.addEventListener("resize", resize);
});
watch(() => props.project.terminal_output, writeSnapshot);
watch(() => studio.state.terminalSettings, applySettings, { deep: true });
watch(
    () => props.active,
    (active) => {
        if (active) {
            fit();
            terminal?.focus();
        }
    }
);
onBeforeUnmount(() => {
    window.removeEventListener("resize", resize);
    try {
        webglAddon?.dispose();
    } catch (_) {}
    terminal?.dispose();
});
</script>

<template>
    <div
        class="project-terminal"
        :style="{
            background: studio.state.terminalSettings.background,
            color: studio.state.terminalSettings.foreground
        }">
        <div
            ref="host"
            class="terminal-surface"
            :style="{ background: studio.state.terminalSettings.background }"></div>
    </div>
</template>
