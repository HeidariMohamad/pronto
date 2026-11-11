import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../services/db";
import { translations } from "../services/i18n";
import { interfaceText } from '../services/interfaceText';

export function useTranslation() {
    const settings = useLiveQuery(() => db.settings.get('v8'));
    const lang = settings?.language || 'pt';
    const dict = translations[lang] || translations['pt'];

    const t = (key, values = {}) => {
        const text = dict[key] || interfaceText[lang]?.[key] || interfaceText.en[key] || key;
        return typeof text === "string" ? text.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match) : text;
    };

    return { t, lang };
}
