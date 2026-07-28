<script setup>
import { useStudioStore } from "../stores/studio.js";
import AppIcon from "./AppIcon.vue";
const studio = useStudioStore();
const resources = [
    {
        title: "CLI 文档",
        description: "命令、配置与操作指南",
        target: "https://solon.noear.org/article/soloncode",
        icon: "documentation"
    },
    {
        title: "Studio 官网",
        description: "版本发布与产品动态",
        target: "https://soloncode.studio/",
        icon: "official-website"
    },
    {
        title: "Studio 源码仓库",
        description: "源码、Issue 与更新日志",
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
    <section class="learning-panel">
        <header class="learning-header">
            <span class="learning-kicker">SOLONCODE STUDIO 学习中心</span>
            <h1>让“数字员工”参与思考、创作与实践</h1>
            <p>
                SolonCode Studio 是 SolonCode CLI 的桌面专属工作台。你可以围绕资料、想法或项目建立工作区，通过 Web 或
                CLI 持续推进任务。
            </p>
        </header>
        <div class="learning-content">
            <section class="learning-section">
                <div class="learning-section-heading">
                    <span class="learning-section-index">01</span>
                    <div>
                        <h2>开始工作</h2>
                        <p>从你正在处理的内容和目标出发。</p>
                    </div>
                </div>
                <ol class="learning-steps">
                    <li>
                        <strong>准备上下文</strong>
                        <span>选择包含资料、内容或项目的本地目录，也可以添加在远程服务器运行的工作区。</span>
                    </li>
                    <li>
                        <strong>选择交互入口</strong>
                        <span>使用 Web 获得直观体验，或通过 CLI 进入更灵活的命令行工作方式。</span>
                    </li>
                    <li>
                        <strong>说清你的目标</strong>
                        <span>描述想理解的问题、要整理的资料或希望完成的成果，再通过对话逐步完善。</span>
                    </li>
                </ol>
            </section>
            <section class="learning-section">
                <div class="learning-section-heading">
                    <span class="learning-section-index">02</span>
                    <div>
                        <h2>探索更多可能</h2>
                        <p>赋能数字员工，灵活应对各类任务。</p>
                    </div>
                </div>
                <div class="learning-possibilities">
                    <article
                        v-for="item in ['学习与理解', '内容与创作', '分析与整理', '研发与工程', '更多，等你发现']"
                        :key="item"
                        class="learning-possibility">
                        <strong>{{ item }}</strong>
                        <span>围绕资料、想法和真实项目持续思考、整理并完成任务。</span>
                    </article>
                </div>
            </section>
            <section class="learning-section">
                <div class="learning-section-heading">
                    <span class="learning-section-index">03</span>
                    <div>
                        <h2>官方资源</h2>
                        <p>文档、产品动态与开源代码集中在这里。</p>
                    </div>
                </div>
                <div class="learning-resources">
                    <button
                        v-for="resource in resources"
                        :key="resource.title"
                        class="learning-resource"
                        type="button"
                        @click="open(resource)">
                        <span class="learning-resource-icon"><AppIcon :name="resource.icon" /></span>
                        <span class="learning-resource-copy">
                            <strong>{{ resource.title }}</strong>
                            <small>{{ resource.description }}</small>
                        </span>
                        <span class="learning-resource-arrow"><AppIcon name="open-resource" /></span>
                    </button>
                </div>
            </section>
        </div>
    </section>
</template>
