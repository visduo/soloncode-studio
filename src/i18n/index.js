import { readonly, ref } from "vue";
import enUS from "./locales/en-US.js";
import zhCN from "./locales/zh-CN.js";
import zhTW from "./locales/zh-TW.js";

export const DEFAULT_LOCALE = "zh-CN";
export const SUPPORTED_LOCALES = ["zh-CN", "zh-TW", "en-US"];

const messages = { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS };
const currentLocale = ref(DEFAULT_LOCALE);

function interpolate(message, params) {
    return message.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
    );
}

export function setLocale(locale) {
    currentLocale.value = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
    document.documentElement.lang = currentLocale.value;
}

export function t(key, params = {}) {
    const message = messages[currentLocale.value]?.[key] ?? messages[DEFAULT_LOCALE]?.[key];
    if (message == null) {
        if (import.meta.env.DEV) console.warn(`Missing translation: ${key}`);
        return key;
    }
    return interpolate(String(message), params);
}

export function useI18n() {
    return { locale: readonly(currentLocale), setLocale, t };
}
