import { useQueryClient } from "@tanstack/react-query";
import { useUpdateMe } from "@/features/auth/api";
import { setLanguage, type Lang } from "@/i18n";

/** "Changes at once and is remembered" (UI 3.3). */
export function useChangeLanguage(): (lang: Lang) => void {
  const queryClient = useQueryClient();
  const { mutate } = useUpdateMe();
  return (lang) => {
    void setLanguage(lang);
    mutate(
      { language: lang },
      {
        // Whatever the server wrote in the other language is fetched again, so no screen mixes the two (U9).
        onSuccess: () => queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "auth" }),
      },
    );
  };
}
