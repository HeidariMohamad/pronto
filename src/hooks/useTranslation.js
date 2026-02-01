import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../services/db";
import { translations } from "../services/i18n";

export function useTranslation() {
    const settings = useLiveQuery(() => db.settings.get('v8'));
    const lang = settings?.language || 'pt';
    const dict = translations[lang] || translations['pt'];

    const t = (key) => {
        return dict[key] || key;
    };

    return { t, lang };
}
