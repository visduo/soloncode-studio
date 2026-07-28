<script setup>
import { useI18n } from "../../i18n/index.js";
import { useStudioStore } from "../../stores/studio.js";
import AppIcon from "../AppIcon.vue";

const studio = useStudioStore();
const { t } = useI18n();
</script>

<template>
    <Transition name="dialog">
        <div v-if="studio.dialogs.logs" class="dialog-backdrop">
            <section class="dialog-panel log-dialog-panel" role="dialog" aria-modal="true">
                <div class="log-header">
                    <h2>{{ t("workspace.logs") }}</h2>
                    <div class="log-toolbar">
                        <button class="log-clear" type="button" @click="studio.clearLog">
                            {{ t("common.clear") }}
                        </button>
                        <button class="dialog-close" type="button" @click="studio.dialogs.logs = false">
                            <AppIcon name="close" />
                        </button>
                    </div>
                </div>
                <div class="log-content">
                    <div v-if="!studio.selectedLogs.value.length" class="log-empty">{{ t("dialog.noLogs") }}</div>
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
