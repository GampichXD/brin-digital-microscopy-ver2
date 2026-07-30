import { useGlobalContext } from '../context/GlobalContext';
import { translations } from '../i18n';

export const useTranslation = () => {
  const { language } = useGlobalContext();

  const t = (key: string): string => {
    // Membaca translasi berdasarkan key
    // Kita bisa mengekstrak properti bertingkat jika diperlukan, 
    // tapi saat ini translations adalah objek dictionary flat 1 level.
    const dictionary = translations[language] as Record<string, string>;
    return dictionary[key] || key;
  };

  return { t, language };
};
