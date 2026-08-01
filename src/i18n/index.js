import { readonly, ref } from "vue";
import { LOCALE_OPTIONS } from "../assets/js/constants.js";

export const DEFAULT_LOCALE = "zh-CN";
export const SUPPORTED_LOCALES = LOCALE_OPTIONS.map((option) => option.key);

const localeModules = import.meta.glob("./locales/*.js", { eager: true, import: "default" });
const messages = Object.fromEntries(
    Object.entries(localeModules).map(([file, localeMessages]) => {
        const fileLocale = file.match(/\/([^/]+)\.js$/)?.[1];
        return [fileLocale, localeMessages];
    })
);
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
    const fallbackLocale = currentLocale.value === DEFAULT_LOCALE ? DEFAULT_LOCALE : "en";
    const message = messages[currentLocale.value]?.[key] ?? messages[fallbackLocale]?.[key];
    if (message == null) {
        if (import.meta.env.DEV) console.warn(`Missing translation: ${key}`);
        return key;
    }
    return interpolate(String(message), params);
}

export function useI18n() {
    return { locale: readonly(currentLocale), setLocale, t };
}
