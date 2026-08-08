import { HIDDEN_STUDIO_UPDATE_KEY } from '../assets/js/constants.js';
import { t } from '../i18n/index.js';

export function createStudioEnvironment({
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
  showLogs,
  openExternalUrl,
  clearManagedSessions,
  persistJavaExecutablePath,
}) {
  function showInstallPrompt() {
    queuePrompt({
      key: 'install-cli',
      title: t('prompt.cliMissingTitle'),
      message: t('prompt.cliMissingMessage'),
      actions: [
        { label: t('prompt.acknowledge'), handler: closePrompt },
        { label: t('prompt.installCli'), primary: true, handler: () => (closePrompt(), handleInstall()) },
      ],
    });
  }

  async function refreshVersions(options = {}) {
    try {
      const info = await invoke('check_versions', {
        javaExecutable: state.javaExecutablePath || null,
      });
      state.installed = Boolean(info.installed);
      state.cliUpdateAvailable = Boolean(info.cli_update_available);
      state.studioUpdateAvailable = Boolean(info.studio_update_available);
      state.studioVersion = info.studio_current
        ? `v${String(info.studio_current).replace(/^v/, '')}`
        : t('status.versionUnknown');
      state.studioLatestVersion = info.studio_latest ? `v${String(info.studio_latest).replace(/^v/, '')}` : '';
      state.cliVersion = info.cli_current ? `v${String(info.cli_current).replace(/^v/, '')}` : '';
      state.cliLatestVersion = info.cli_latest ? `v${String(info.cli_latest).replace(/^v/, '')}` : '';
      if (info.error) showError(t('message.checkFailed', { error: info.error }));
      setStatus(
        state.installed
          ? state.cliUpdateAvailable
            ? t('status.cliUpdateAvailable')
            : t('common.installed')
          : t('status.cliMissing'),
        state.installed ? (state.cliUpdateAvailable ? 'update-available' : 'installed') : 'not-installed',
      );
      if (info.cli_update_available) {
        queuePrompt({
          key: 'cli-update',
          title: t('prompt.cliUpdateTitle'),
          message: t('prompt.cliUpdateMessage'),
          actions: [
            { label: t('prompt.later'), handler: closePrompt },
            { label: t('prompt.updateNow'), primary: true, handler: () => (closePrompt(), performUpdate()) },
          ],
        });
      }
      const latestStudioVersion = info.studio_latest ? `v${String(info.studio_latest).replace(/^v/, '')}` : '';
      if (info.studio_update_available && localStorage.getItem(HIDDEN_STUDIO_UPDATE_KEY) !== latestStudioVersion) {
        queuePrompt({
          key: `studio-update-${info.studio_latest}`,
          title: t('prompt.studioUpdateTitle'),
          message: t('prompt.studioUpdateMessage'),
          actions: [
            { label: t('prompt.later'), handler: closePrompt },
            {
              label: t('prompt.updateNow'),
              primary: true,
              handler: () => (closePrompt(), openExternalUrl('https://soloncode.studio/')),
            },
          ],
        });
      }
      return info;
    } catch (error) {
      if (!options.preserveInstalledOnError) state.installed = false;
      showError(t('message.versionCheckFailed', { error }));
      setStatus(t('status.checkFailed', { error }), state.installed ? 'installed' : 'not-installed');
      return { error: String(error) };
    }
  }

  async function switchJavaExecutable() {
    if (state.cliMutating || state.javaSelecting) return false;
    state.javaSelecting = true;
    try {
      const javaExecutable = await invoke('pick_java_executable', {
        title: t('environment.pickJavaTitle'),
        current: state.javaExecutablePath || null,
      });
      if (!javaExecutable) return false;

      const javaVersion = await invoke('check_java', { javaExecutable });
      if (!javaVersion) throw new Error(t('environment.invalidJavaExecutable'));

      state.javaExecutablePath = javaExecutable;
      state.javaVersion = javaVersion;
      state.javaAvailable = true;
      persistJavaExecutablePath(javaExecutable);
      showSuccess(t('message.javaSwitchSuccess', { version: javaVersion }));
      return true;
    } catch (error) {
      showError(t('message.javaCheckFailed', { error }));
      return false;
    } finally {
      state.javaSelecting = false;
    }
  }

  async function refreshEnvironment(options = {}) {
    if (state.environmentChecking || (state.cliMutating && !options.allowDuringCliMutation)) return;
    state.environmentChecking = true;
    try {
      const javaVersion = await invoke('check_java', {
        javaExecutable: state.javaExecutablePath || null,
      });
      state.javaVersion = typeof javaVersion === 'string' ? javaVersion : '';
      state.javaAvailable = Boolean(state.javaVersion);
    } catch (error) {
      state.javaAvailable = false;
      state.javaVersion = '';
      showError(t('message.javaCheckFailed', { error }));
      appendLog(formatError(t('log.javaCheckFailed', { error })));
    }
    try {
      if (options.checkVersions === false) {
        setStatus(
          state.installed ? t('common.installed') : t('status.cliMissing'),
          state.installed ? 'installed' : 'not-installed',
        );
        return { skipped: true };
      }
      return await refreshVersions(options);
    } finally {
      state.environmentChecking = false;
    }
  }

  async function performInstall(action = 'install') {
    if (cliMaintenanceBlocked.value) return;
    selectWorkspace(null);
    showLogs();
    appendLog(t('log.installingCli'));
    state.cliMutating = true;
    setStatus(t('status.installingCli'), 'detecting');
    try {
      await invoke('install_soloncode');
      state.installed = true;
      await refreshEnvironment({ preserveInstalledOnError: true, allowDuringCliMutation: true });
      showSuccess(t(action === 'update' ? 'message.updateSuccess' : 'message.installSuccess'));
      return true;
    } catch (error) {
      appendLog(formatError(error));
      setStatus(t('status.cliInstallFailed'), 'not-installed');
      showError(t(action === 'update' ? 'message.updateFailed' : 'message.installFailed', { error }));
      return false;
    } finally {
      state.cliMutating = false;
    }
  }

  function handleInstall() {
    if (cliMaintenanceBlocked.value) return;
    confirmAction({
      key: 'confirm-install-cli',
      title: t('prompt.installTitle'),
      message: t('prompt.installMessage'),
      confirmLabel: t('prompt.confirmInstall'),
      onConfirm: performInstall,
    });
  }

  async function performUpdate() {
    if (cliMaintenanceBlocked.value || !state.installed) return;
    return performInstall('update');
  }

  function handleUpdate() {
    if (cliMaintenanceBlocked.value || !state.cliUpdateAvailable) return;
    confirmAction({
      key: 'confirm-update-cli',
      title: t('prompt.updateTitle'),
      message: t('prompt.updateMessage'),
      confirmLabel: t('prompt.confirmUpdate'),
      onConfirm: performUpdate,
    });
  }

  function handleCliPrimaryAction() {
    return state.installed ? handleUpdate() : handleInstall();
  }

  async function performUninstall() {
    if (cliMaintenanceBlocked.value) return;
    selectWorkspace(null);
    showLogs();
    appendLog(t('log.uninstallingCli'));
    state.cliMutating = true;
    try {
      await invoke('uninstall_soloncode');
      state.installed = false;
      state.cliUpdateAvailable = false;
      clearManagedSessions();
      await refreshVersions();
      setStatus(t('status.cliUninstalled'), 'not-installed');
      showSuccess(t('message.uninstallSuccess'));
      return true;
    } catch (error) {
      appendLog(formatError(error));
      showError(t('message.uninstallFailed', { error }));
      return false;
    } finally {
      state.cliMutating = false;
    }
  }

  function handleUninstall() {
    if (cliMaintenanceBlocked.value) return;
    confirmAction({
      key: 'confirm-uninstall-cli',
      title: t('prompt.uninstallTitle'),
      message: t('prompt.uninstallMessage'),
      confirmLabel: t('prompt.confirmUninstall'),
      onConfirm: performUninstall,
    });
  }

  return {
    showInstallPrompt,
    refreshEnvironment,
    switchJavaExecutable,
    handleCliPrimaryAction,
    handleUninstall,
  };
}
