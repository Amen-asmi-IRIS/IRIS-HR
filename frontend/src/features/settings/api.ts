import { useMutation, useQuery } from "@tanstack/react-query";
import { api, call } from "@/api/client";

export type SettingsGroup = "hr" | "system";

export const settingKeys = {
  group: (group: SettingsGroup) => ["settings", group] as const,
};

export function useSettings(group: SettingsGroup) {
  return useQuery({
    queryKey: settingKeys.group(group),
    queryFn: () => (group === "system" ? call(api.GET("/api/v1/settings/system")) : call(api.GET("/api/v1/settings/hr"))),
  });
}

/** Saves one setting. The caller reads the group again when it has saved everything that changed. */
export function useSaveSetting(group: SettingsGroup) {
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => {
      const options = { params: { path: { key } }, body: { value } };
      return group === "system" ? call(api.PUT("/api/v1/settings/system/{key}", options)) : call(api.PUT("/api/v1/settings/hr/{key}", options));
    },
  });
}
