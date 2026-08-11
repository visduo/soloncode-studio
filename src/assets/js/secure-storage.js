import {
  APP_PREFERENCES_KEY,
  CLOSE_WINDOW_BEHAVIOR_KEY,
  HIDDEN_STUDIO_UPDATE_KEY,
  JAVA_EXECUTABLE_KEY,
  SELECTED_WORKSPACE_KEY,
  TERMINAL_SETTINGS_KEY,
  WORKSPACE_ALIASES_KEY,
  WORKSPACE_GROUPS_KEY,
  WORKSPACES_KEY,
} from './constants.js';

export const ENCRYPTED_STORAGE_PREFIX = 'scenc:v1:';
const ENCRYPTED_STORAGE_MARKER = 'scenc:';

const SECURE_STORAGE_KEYS = [
  WORKSPACES_KEY,
  WORKSPACE_ALIASES_KEY,
  WORKSPACE_GROUPS_KEY,
  HIDDEN_STUDIO_UPDATE_KEY,
  TERMINAL_SETTINGS_KEY,
  APP_PREFERENCES_KEY,
  JAVA_EXECUTABLE_KEY,
  CLOSE_WINDOW_BEHAVIOR_KEY,
  SELECTED_WORKSPACE_KEY,
];

const plaintextCache = new Map();
const writeQueues = new Map();
let initialized = false;
let initializationPromise = null;

const invoke = (...args) => window.__TAURI__.core.invoke(...args);

function trackWrite(key, promise) {
  writeQueues.set(key, promise);
  promise.then(
    () => {
      if (writeQueues.get(key) === promise) writeQueues.delete(key);
    },
    (error) => {
      if (writeQueues.get(key) === promise) writeQueues.delete(key);
      console.error(`Failed to persist encrypted local storage item: ${key}`, error);
    },
  );
  return promise;
}

function enqueueWrite(key, operation) {
  const previous = writeQueues.get(key) || Promise.resolve();
  return trackWrite(key, previous.catch(() => undefined).then(operation));
}

function rejectUnavailableWrite(key) {
  const promise = Promise.reject(new Error('本地加密存储尚未初始化'));
  promise.catch((error) => console.error(`Failed to persist encrypted local storage item: ${key}`, error));
  return promise;
}

async function encryptItem(key, plaintext) {
  return await invoke('encrypt_local_storage_item', { key, plaintext });
}

async function decryptItem(key, payload) {
  return await invoke('decrypt_local_storage_item', { key, payload });
}

async function initialize() {
  const storedValues = SECURE_STORAGE_KEYS.map((key) => [key, localStorage.getItem(key)]);
  const hasEncryptedData = storedValues.some(([, value]) => value?.startsWith(ENCRYPTED_STORAGE_MARKER));

  await invoke('initialize_secure_storage', { hasEncryptedData });

  for (const [key, value] of storedValues) {
    if (value === null) {
      plaintextCache.set(key, null);
      continue;
    }

    if (value.startsWith(ENCRYPTED_STORAGE_PREFIX)) {
      plaintextCache.set(key, await decryptItem(key, value));
      continue;
    }

    if (value.startsWith(ENCRYPTED_STORAGE_MARKER)) {
      throw new Error(`不支持的本地加密数据版本：${key}`);
    }

    // 旧版本明文先保留在内存中；只有加密成功后才原位覆盖。
    plaintextCache.set(key, value);
    const encrypted = await encryptItem(key, value);
    const verified = await decryptItem(key, encrypted);
    if (verified !== value) throw new Error(`本地存储迁移校验失败：${key}`);
    localStorage.setItem(key, encrypted);
  }

  initialized = true;
}

export function initializeSecureStorage() {
  if (!initializationPromise) {
    initializationPromise = initialize().catch((error) => {
      initialized = false;
      initializationPromise = null;
      throw error;
    });
  }
  return initializationPromise;
}

export function getSecureItem(key) {
  if (!initialized) return null;
  return plaintextCache.get(key) ?? null;
}

export function setSecureItem(key, value) {
  if (!initialized) return rejectUnavailableWrite(key);
  const plaintext = String(value);
  plaintextCache.set(key, plaintext);
  return enqueueWrite(key, async () => {
    const encrypted = await encryptItem(key, plaintext);
    localStorage.setItem(key, encrypted);
  });
}

export function removeSecureItem(key) {
  if (!initialized) return rejectUnavailableWrite(key);
  plaintextCache.set(key, null);
  return enqueueWrite(key, async () => {
    localStorage.removeItem(key);
  });
}

export async function flushSecureStorageWrites() {
  await Promise.all([...writeQueues.values()]);
}
