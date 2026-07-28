<script setup>
import { useI18n } from "../i18n/index.js";
import { useStudioStore } from "../stores/studio.js";
import AppIcon from "./AppIcon.vue";
const studio = useStudioStore();
const { t } = useI18n();
const resources = [
    {
        titleKey: "learning.cliDocs",
        descriptionKey: "learning.cliDocsDescription",
        target: "https://solon.noear.org/article/soloncode",
        icon: "documentation"
    },
    {
        titleKey: "learning.website",
        descriptionKey: "learning.websiteDescription",
        target: "https://soloncode.studio/",
        icon: "official-website"
    },
    {
        titleKey: "learning.repository",
        descriptionKey: "learning.repositoryDescription",
        target: "github-release",
        icon: "source-repository"
    }
];
function open(resource) {
    if (resource.target === "github-release") studio.openStudioGithubReleasePage();
    else studio.openExternalUrl(resource.target);
}
</script>

<template>
    <div class="learning-panel">
        <header class="learning-header">
            <span class="learning-kicker">{{ t("learning.kicker") }}</span>
            <h1>{{ t("learning.hero") }}</h1>
            <p>{{ t("learning.intro") }}</p>
        </header>
        <div class="learning-content">
            <section class="learning-section">
                <div class="learning-section-heading">
                    <span class="learning-section-index">01</span>
                    <div>
                        <h2>{{ t("learning.start") }}</h2>
                        <p>{{ t("learning.startDescription") }}</p>
                    </div>
                </div>
                <ol class="learning-steps">
                    <li>
                        <strong>{{ t("learning.stepContext") }}</strong>
                        <span>{{ t("learning.stepContextDescription") }}</span>
                    </li>
                    <li>
                        <strong>{{ t("learning.stepEntry") }}</strong>
                        <span>{{ t("learning.stepEntryDescription") }}</span>
                    </li>
                    <li>
                        <strong>{{ t("learning.stepGoal") }}</strong>
                        <span>{{ t("learning.stepGoalDescription") }}</span>
                    </li>
                </ol>
            </section>
            <section class="learning-section">
                <div class="learning-section-heading">
                    <span class="learning-section-index">02</span>
                    <div>
                        <h2>{{ t("learning.explore") }}</h2>
                        <p>{{ t("learning.exploreDescription") }}</p>
                    </div>
                </div>
                <div class="learning-possibilities">
                    <article class="learning-possibility">
                        <strong>{{ t("learning.understand") }}</strong>
                        <span>{{ t("learning.understandDescription") }}</span>
                    </article>
                    <article class="learning-possibility">
                        <strong>{{ t("learning.create") }}</strong>
                        <span>{{ t("learning.createDescription") }}</span>
                    </article>
                    <article class="learning-possibility">
                        <strong>{{ t("learning.analyze") }}</strong>
                        <span>{{ t("learning.analyzeDescription") }}</span>
                    </article>
                    <article class="learning-possibility">
                        <strong>{{ t("learning.engineer") }}</strong>
                        <span>{{ t("learning.engineerDescription") }}</span>
                    </article>
                    <article class="learning-possibility learning-possibility-more">
                        <strong>{{ t("learning.more") }}</strong>
                        <span>{{ t("learning.moreDescription") }}</span>
                    </article>
                </div>
            </section>
            <section class="learning-section">
                <div class="learning-section-heading">
                    <span class="learning-section-index">03</span>
                    <div>
                        <h2>{{ t("learning.resources") }}</h2>
                        <p>{{ t("learning.resourcesDescription") }}</p>
                    </div>
                </div>
                <div class="learning-resources">
                    <button
                        v-for="resource in resources"
                        :key="resource.titleKey"
                        class="learning-resource"
                        type="button"
                        @click="open(resource)">
                        <span class="learning-resource-icon"><AppIcon :name="resource.icon" /></span>
                        <span class="learning-resource-copy">
                            <strong>{{ t(resource.titleKey) }}</strong>
                            <small>{{ t(resource.descriptionKey) }}</small>
                        </span>
                        <span class="learning-resource-arrow"><AppIcon name="open-resource" /></span>
                    </button>
                </div>
            </section>
        </div>
    </div>
</template>
