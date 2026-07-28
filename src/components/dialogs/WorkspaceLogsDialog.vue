<script setup>
import { useStudioStore } from "../../stores/studio.js";
import AppIcon from "../AppIcon.vue";

const studio = useStudioStore();
</script>

<template>
    <Transition name="dialog">
        <div v-if="studio.dialogs.logs" class="dialog-backdrop">
            <section class="dialog-panel log-dialog-panel" role="dialog" aria-modal="true">
                <div class="log-header">
                    <h2>运行日志</h2>
                    <div class="log-toolbar">
                        <button class="log-clear" type="button" @click="studio.clearLog">清除</button>
                        <button
                            class="dialog-close"
                            type="button"
                            @click="studio.dialogs.logs = false">
                            <AppIcon name="close" />
                        </button>
                    </div>
                </div>
                <div class="log-content">
                    <div v-if="!studio.selectedLogs.value.length" class="log-empty">当前工作区还没有运行日志。</div>
                    <section v-else class="log-group">
                        <div
                            v-for="(line, index) in studio.selectedLogs.value"
                            :key="index"
                            class="log-line"
                            :class="{
                                'log-error': line.startsWith('❌'),
                                'log-success': line.startsWith('✅'),
                                'log-info': line.startsWith('📁')
                            }">
                            {{ line }}
                        </div>
                    </section>
                </div>
            </section>
        </div>
    </Transition>
</template>
