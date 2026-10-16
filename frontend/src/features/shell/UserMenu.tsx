import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCurrentUser, useLogout } from "@/features/auth/api";
import { LANGUAGES, useLang } from "@/i18n";
import { useChangeLanguage } from "./useChangeLanguage";

interface UserMenuProps {
  /** A round button with initials only, for the phone top bar. */
  compact?: boolean;
  /** Also offer the other language, where there is no room for a separate switch. */
  withLanguage?: boolean;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/** Name, change password, sign out (UI 3.3). */
export function UserMenu({ compact = false, withLanguage = false }: UserMenuProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const me = useCurrentUser();
  const navigate = useNavigate();
  const logout = useLogout();
  const changeLanguage = useChangeLanguage();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={compact ? "icon" : "default"} className={compact ? undefined : "w-full justify-start px-2"} aria-label={t("shell:userMenu.label", { name: me.name })}>
          <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-caption font-semibold text-info">
            {initialsOf(me.name)}
          </span>
          {!compact && <span className="truncate">{me.name}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <span className="block text-body font-semibold text-foreground">{me.name}</span>
          <span className="block">{me.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {withLanguage &&
          LANGUAGES.filter((code) => code !== lang).map((code) => (
            <DropdownMenuItem key={code} lang={code} onSelect={() => changeLanguage(code)}>
              {t(`language.${code}`)}
            </DropdownMenuItem>
          ))}
        <DropdownMenuItem onSelect={() => navigate("/password")}>{t("shell:userMenu.changePassword")}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => logout.mutate()}>{t("shell:userMenu.signOut")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
