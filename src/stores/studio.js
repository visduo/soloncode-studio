import { computed, reactive, ref, shallowReactive } from 'vue';
import {
  CLOSE_WINDOW_BEHAVIOR_KEY,
  DEFAULT_APP_PREFERENCES,
  DEFAULT_TERMINAL_SETTINGS,
  DEFAULT_WORKSPACE_GROUP_ID,
  HOME_TAB_KEY,
  HOME_WORKSPACE_KEY,
  IS_DEVELOPMENT_MODE,
  LAUNCH_MODES,
  MAX_LOG_LINES,
  PROJECT_TYPES,
  RUN_TARGET_OPTIONS,
  RUN_TARGETS,
  SELECTED_WORKSPACE_KEY,
} from '../assets/js/constants.js';
import {
  flushSecureStorageWrites,
  getSecureItem,
  initializeSecureStorage,
  setSecureItem,
} from '../assets/js/secure-storage.js';
import {
  loadAppPreferences,
  loadJavaExecutablePath,
  loadTerminalSettings,
  normalizeAppPreferences,
  normalizeTerminalSettings,
  persistAppPreferences,
  persistJavaExecutablePath,
  persistTerminalSettings,
} from '../assets/js/storage.js';
import { withBasicAuth } from '../assets/js/url.js';
import { getWorkspaceDisplayName, getWorkspaceName } from '../assets/js/workspace-store.js';
import { setLocale, t } from '../i18n/index.js';
import { createStudioEnvironment } from './environment.js';
import { createStudioOperations } from './operations.js';
import { createStudioWorkspaces } from './workspaces.js';

const state = reactive({
  initialized: false,
  installed: false,
  javaAvailable: false,
  javaVersion: '',
  javaExecutablePath: '',
  javaSystemExecutablePath: '',
  javaSelecting: false,
  environmentChecking: false,
  cliMutating: false,
  resolvedThemeMode: 'light',
  cliUpdateAvailable: false,
  studioUpdateAvailable: false,
  studioVersion: t('status.versionUnknown'),
  studioLatestVersion: '',
  cliVersion: '',
  cliLatestVersion: '',
  messages: [],
  homeWorkspacePath: '',
  selectedWorkspace: null,
  activeTabKey: HOME_TAB_KEY,
  homeSection: 'workspace',
  status: { text: t('status.checking'), type: 'detecting' },
  workspaceSearch: '',
  openMenu: null,
  preferences: { ...DEFAULT_APP_PREFERENCES },
  terminalSettings: { ...DEFAULT_TERMINAL_SETTINGS },
});
setLocale(state.preferences.locale);
const projects = shallowReactive(new Map());
const tabOrder = ref([]);
const logs = shallowReactive(new Map());
const promptQueue = ref([]);
const queuedPromptKeys = new Set();
const taskSessions = shallowReactive(new Map());
const dialogs = reactive({
  alias: false,
  remote: false,
  workspaceGroup: false,
  workspaceMove: false,
  logs: false,
  httpAuth: false,
});
let installCliPromptShown = false;
let nextMessageId = 0;
const messageTimers = new Map();

const invoke = (...args) => window.__TAURI__.core.invoke(...args);
const workspaceKey = (path) => path || HOME_WORKSPACE_KEY;
const makeProjectKey = (path, mode = LAUNCH_MODES.web) => `${workspaceKey(path)}::${mode}`;
const formatError = (error) =>
  String(error || t('log.unknownError')).startsWith('❌') ? String(error) : `❌ ${error}`;

function projectsForWorkspace(path) {
  const prefix = `${workspaceKey(path)}::`;
  return [...projects.values()].filter((project) => project.project_key.startsWith(prefix));
}

function projectForWorkspace(path, mode) {
  return mode ? projects.get(makeProjectKey(path, mode)) : projectsForWorkspace(path)[0] || null;
}

function setStatus(text, type) {
  state.status = { text, type };
}

function closeMessage(id) {
  const index = state.messages.findIndex((message) => message.id === id);
  if (index >= 0) state.messages.splice(index, 1);
  clearTimeout(messageTimers.get(id));
  messageTimers.delete(id);
}

function showMessage(text, type = 'success') {
  const id = ++nextMessageId;
  state.messages.push({ id, text: String(text), type });
  if (state.messages.length > 3) closeMessage(state.messages[0].id);
  messageTimers.set(
    id,
    setTimeout(() => closeMessage(id), 3200),
  );
}

const showSuccess = (text) => showMessage(text, 'success');
const showError = (text) => showMessage(text, 'error');

function dismissMenu() {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && activeElement.closest('.app-menu-wrap, .app-menu')) {
    activeElement.blur();
  }
  state.openMenu = null;
}

function appendWorkspaceLog(payload) {
  const key = payload.workspace_key || 'system';
  const old = logs.get(key) || { name: payload.name || t('log.system'), lines: [] };
  const message = payload.message_key ? t(payload.message_key, payload.message_params || {}) : payload.message || '';
  const entry = { name: payload.name || old.name, lines: [...old.lines, message] };
  if (entry.lines.length > MAX_LOG_LINES) entry.lines.splice(0, entry.lines.length - MAX_LOG_LINES);
  logs.set(key, entry);
}

function appendLog(text, key = HOME_WORKSPACE_KEY, name = t('workspace.home')) {
  appendWorkspaceLog({ workspace_key: key, name, message: text });
}

function clearLog() {
  logs.delete(workspaceKey(state.selectedWorkspace));
}

function closePrompt() {
  const closed = promptQueue.value.shift();
  if (closed?.key) queuedPromptKeys.delete(closed.key);
}

function queuePrompt(prompt) {
  if (prompt.key && queuedPromptKeys.has(prompt.key)) return;
  if (prompt.key) queuedPromptKeys.add(prompt.key);
  dismissMenu();
  promptQueue.value.push(prompt);
}

function confirmAction({ key, title, message, confirmLabel, onConfirm }) {
  queuePrompt({
    key,
    title,
    message,
    actions: [
      { label: t('common.cancel'), handler: closePrompt },
      { label: confirmLabel, primary: true, handler: () => (closePrompt(), onConfirm()) },
    ],
  });
}

function syncTabOrder() {
  const keys = new Set(projects.keys());
  tabOrder.value = tabOrder.value.filter((key) => keys.has(key));
  for (const key of keys) if (!tabOrder.value.includes(key)) tabOrder.value.push(key);
}

function upsertProject(project) {
  const next = { ...project };
  if (next.type !== PROJECT_TYPES.webPage) {
    next.name = getWorkspaceDisplayName(next.workspace, next.name);
    next.project_key = makeProjectKey(next.workspace, next.mode || LAUNCH_MODES.web);
  }
  projects.set(next.project_key, next);
  syncTabOrder();
}

function removeProject(key) {
  projects.delete(key);
  taskSessions.delete(key);
  syncTabOrder();
  if (state.activeTabKey === key) activateHome();
}

function shouldRenderProject(project) {
  return (
    project.type === PROJECT_TYPES.webPage ||
    (project.launch_target !== RUN_TARGETS.webSystem && project.launch_target !== RUN_TARGETS.cliSystem)
  );
}

function activateHome() {
  dismissMenu();
  state.activeTabKey = HOME_TAB_KEY;
}

function activateProject(key) {
  dismissMenu();
  const project = projects.get(key);
  state.activeTabKey = project && shouldRenderProject(project) ? key : HOME_TAB_KEY;
}

function activateHomeSection(section) {
  dismissMenu();
  state.homeSection = section;
}

async function openProject(project) {
  if (!project) return;
  if (project.external && project.url) await openExternalUrl(project.url);
  else activateProject(project.project_key);
}

function reorderTab(sourceKey, targetKey) {
  const order = [...tabOrder.value];
  const sourceIndex = order.indexOf(sourceKey);
  const targetIndex = order.indexOf(targetKey);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
  order.splice(targetIndex, 0, order.splice(sourceIndex, 1)[0]);
  tabOrder.value = order;
}

async function openExternalUrl(url, credentials = {}) {
  try {
    await invoke('open_external_url', {
      url: withBasicAuth(url, credentials.username, credentials.password),
    });
  } catch (error) {
    appendLog(formatError(t('log.openUrlFailed', { error })));
  }
}

async function openStudioGithubReleasePage() {
  try {
    await invoke('open_studio_github_release_page');
  } catch (error) {
    appendLog(formatError(error));
  }
}

async function goHome() {
  await invoke('go_home');
}

async function revealWorkspace(path) {
  try {
    await invoke('reveal_workspace', { workspace: path || null });
  } catch (error) {
    appendLog(formatError(error), workspaceKey(path), getWorkspaceName(path));
  }
}

function showLogsDialog(path = state.selectedWorkspace) {
  selectWorkspace(path);
  dialogs.logs = true;
}
let environmentActions;
let workspaceActions;
const operations = createStudioOperations({
  state,
  projects,
  isManagedProject: (project) => project.type !== PROJECT_TYPES.webPage,
  invoke,
  workspaceKey,
  makeProjectKey,
  projectForWorkspace,
  selectWorkspace: (...args) => workspaceActions.selectWorkspace(...args),
  refreshWorkspaces: () => workspaceActions.refreshWorkspaces(),
  appendLog,
  formatError,
  setStatus,
  upsertProject,
  removeProject,
  activateProject,
  openExternalUrl,
  queuePrompt,
  closePrompt,
  showLogs: () => (dialogs.logs = true),
  showInstallPrompt: () => environmentActions.showInstallPrompt(),
});
const {
  startingWorkspaceKeys,
  stoppingWorkspaceKeys,
  startingRuns,
  cliMaintenanceBlocked,
  workspaceLaunchBlocked,
  clearManagedSessions,
  runWorkspace,
  stopWorkspace,
  requestCloseProject,
  sendCliInput,
} = operations;
workspaceActions = createStudioWorkspaces({
  state,
  startingWorkspaceKeys,
  getProject: (key) => projects.get(key),
  invoke,
  workspaceKey,
  projectForWorkspace,
  dismissMenu,
  appendLog,
  formatError,
  showSuccess,
  showError,
  confirmAction,
  removeProject,
  upsertProject,
  activateProject,
  dialogs,
});
const {
  dialogForms,
  workspaceGroups,
  workspaceGroupsWithEntries,
  hydrateStoredWorkspaces,
  refreshWorkspaceGroups,
  selectWorkspace,
  pickWorkspace,
  showAliasDialog,
  saveAlias,
  showRemoteDialog,
  saveRemote,
  removeWorkspace,
  togglePinned,
  showWorkspaceGroupDialog,
  saveWorkspaceGroup,
  showWorkspaceMoveDialog,
  moveWorkspace,
  moveWorkspaceToGroup,
  requestDeleteWorkspaceGroup,
  toggleWorkspaceGroup,
  openWebPage,
  detectWebPageAuthentication,
  requestHttpAuthentication,
  submitHttpAuth,
  closeHttpAuthDialog,
} = workspaceActions;
environmentActions = createStudioEnvironment({
  state,
  cliMaintenanceBlocked,
  invoke,
  setStatus,
  appendLog,
  formatError,
  showSuccess,
  showError,
  queuePrompt,
  closePrompt,
  confirmAction,
  selectWorkspace,
  showLogs: () => (dialogs.logs = true),
  openExternalUrl,
  clearManagedSessions,
  persistJavaExecutablePath,
});
const { showInstallPrompt, refreshEnvironment, switchJavaExecutable, handleCliPrimaryAction, handleUninstall } =
  environmentActions;

async function saveTerminalSettings(settings) {
  try {
    state.terminalSettings = normalizeTerminalSettings(settings);
    await persistTerminalSettings(state.terminalSettings);
    showSuccess(t('message.saveSuccess'));
    return true;
  } catch (error) {
    showError(t('message.saveFailed', { error }));
    return false;
  }
}

async function saveAppPreferences(preferences) {
  try {
    state.preferences = normalizeAppPreferences(preferences);
    setLocale(state.preferences.locale);
    await persistAppPreferences(state.preferences);
    refreshWorkspaceGroups();
    showSuccess(t('message.saveSuccess'));
    return true;
  } catch (error) {
    showError(t('message.saveFailed', { error }));
    return false;
  }
}

function synchronizeThemeMode(themeMode) {
  if ((themeMode !== 'light' && themeMode !== 'dark') || state.preferences.themeMode === themeMode) return false;
  state.preferences = normalizeAppPreferences({ ...state.preferences, themeMode });
  persistAppPreferences(state.preferences);
  return true;
}

function synchronizeLocale(locale) {
  const preferences = normalizeAppPreferences({ ...state.preferences, locale });
  if (preferences.locale !== locale || state.preferences.locale === locale) return false;
  state.preferences = preferences;
  setLocale(locale);
  persistAppPreferences(state.preferences);
  refreshWorkspaceGroups();
  return true;
}

function refreshSystemLocale() {
  if (state.preferences.locale !== 'system') return false;
  setLocale(state.preferences.locale);
  refreshWorkspaceGroups();
  return true;
}

async function applyCloseBehavior(behavior) {
  await flushSecureStorageWrites();
  await invoke(behavior === 'quit' ? 'quit_studio' : 'minimize_to_tray');
}

function handleCloseRequested() {
  const saved = getSecureItem(CLOSE_WINDOW_BEHAVIOR_KEY);
  if (saved === 'quit' || saved === 'tray') return applyCloseBehavior(saved);
  queuePrompt({
    key: 'close-window-behavior',
    title: t('prompt.closeBehaviorTitle'),
    message: t('prompt.closeBehaviorMessage'),
    closeBehavior: {
      selected: 'quit',
      options: [
        { value: 'tray', label: t('prompt.minimizeToTray') },
        { value: 'quit', label: t('prompt.quitStudio') },
      ],
    },
    checkbox: { label: t('prompt.doNotAskAgain') },
    actions: [
      { label: t('common.cancel'), handler: closePrompt },
      {
        label: t('common.confirm'),
        primary: true,
        handler: async ({ checked, behavior }) => {
          if (checked) await setSecureItem(CLOSE_WINDOW_BEHAVIOR_KEY, behavior);
          closePrompt();
          await applyCloseBehavior(behavior);
        },
      },
    ],
  });
}

const eventHandlers = {
  'soloncode-output': (event) => {
    const payload = event.payload;
    appendLog(
      payload && typeof payload === 'object'
        ? payload.message_key
          ? t(payload.message_key, payload.message_params || {})
          : payload.message || ''
        : String(payload),
    );
  },
  'soloncode-workspace-output': (event) => appendWorkspaceLog(event.payload),
  'soloncode-ready': operations.handleReady,
  'soloncode-failed': operations.handleFailed,
  'soloncode-close-requested': handleCloseRequested,
  'soloncode-go-home': activateHome,
  'soloncode-cli-output': operations.handleCliOutput,
};

function registerEvents() {
  const active = [];
  let disposed = false;
  const registrations = Object.entries(eventHandlers).map(async ([name, handler]) => {
    const unlisten = await window.__TAURI__.event.listen(name, handler);
    if (disposed) unlisten();
    else active.push(unlisten);
  });
  return async () => {
    disposed = true;
    await Promise.allSettled(registrations);
    active.splice(0).forEach((unlisten) => unlisten());
  };
}

async function initialize() {
  try {
    await initializeSecureStorage();
    state.javaExecutablePath = loadJavaExecutablePath();
    state.preferences = loadAppPreferences();
    state.terminalSettings = loadTerminalSettings();
    setLocale(state.preferences.locale);
    hydrateStoredWorkspaces();
    state.selectedWorkspace = null;
    await setSecureItem(SELECTED_WORKSPACE_KEY, '');
  } catch (error) {
    appendLog(formatError(error));
    showError(t('message.checkFailed', { error }));
    state.initialized = true;
    return;
  }
  try {
    state.studioVersion = `v${String(await invoke('studio_version')).replace(/^v/, '')}`;
    state.homeWorkspacePath = await invoke('home_workspace_path');
    state.installed = Boolean(await invoke('check_soloncode'));
  } catch (error) {
    appendLog(formatError(error));
  }
  if (!state.installed && !installCliPromptShown) {
    installCliPromptShown = true;
    showInstallPrompt();
  }
  await refreshEnvironment({ checkVersions: state.preferences.autoCheckUpdates });
  state.initialized = true;
}

const orderedProjects = computed(() =>
  tabOrder.value.map((key) => projects.get(key)).filter((project) => project && shouldRenderProject(project)),
);
const hostedProjects = computed(() => [...projects.values()].filter(shouldRenderProject));
const activePrompt = computed(() => promptQueue.value[0] || null);
const selectedLogs = computed(() => logs.get(workspaceKey(state.selectedWorkspace))?.lines.slice(-160) || []);

export function useStudioStore() {
  return {
    state,
    projects,
    startingWorkspaceKeys,
    stoppingWorkspaceKeys,
    startingRuns,
    cliMaintenanceBlocked,
    workspaceLaunchBlocked,
    taskSessions,
    dialogs,
    dialogForms,
    orderedProjects,
    hostedProjects,
    workspaceGroups,
    workspaceGroupsWithEntries,
    activePrompt,
    selectedLogs,
    runTargets: RUN_TARGET_OPTIONS,
    constants: {
      HOME_TAB_KEY,
      HOME_WORKSPACE_KEY,
      DEFAULT_WORKSPACE_GROUP_ID,
      LAUNCH_MODES,
      PROJECT_TYPES,
      RUN_TARGETS,
      IS_DEVELOPMENT_MODE,
    },
    workspaceKey,
    projectForWorkspace,
    dismissMenu,
    activateHome,
    activateProject,
    activateHomeSection,
    openProject,
    reorderTab,
    requestCloseProject,
    selectWorkspace,
    pickWorkspace,
    showAliasDialog,
    saveAlias,
    showRemoteDialog,
    saveRemote,
    showLogsDialog,
    removeWorkspace,
    togglePinned,
    showWorkspaceGroupDialog,
    saveWorkspaceGroup,
    showWorkspaceMoveDialog,
    moveWorkspace,
    moveWorkspaceToGroup,
    requestDeleteWorkspaceGroup,
    toggleWorkspaceGroup,
    openWebPage,
    detectWebPageAuthentication,
    requestHttpAuthentication,
    submitHttpAuth,
    closeHttpAuthDialog,
    openExternalUrl,
    openStudioGithubReleasePage,
    goHome,
    revealWorkspace,
    handleCliPrimaryAction,
    handleUninstall,
    refreshEnvironment,
    switchJavaExecutable,
    runWorkspace,
    stopWorkspace,
    sendCliInput,
    appendLog,
    clearLog,
    closePrompt,
    closeMessage,
    saveAppPreferences,
    synchronizeThemeMode,
    synchronizeLocale,
    refreshSystemLocale,
    saveTerminalSettings,
    initialize,
    registerEvents,
    invoke,
  };
}
