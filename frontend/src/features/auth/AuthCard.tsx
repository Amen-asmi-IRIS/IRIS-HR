import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import logo from "@/assets/iris-logo.png";
import { EnvironmentStrip } from "@/features/shell/EnvironmentStrip";

interface AuthCardProps {
  title: string;
  environment?: string;
  children: ReactNode;
}

/** The centred card of the pages outside the shell: Sign in and Choose a new password. */
export function AuthCard({ title, environment, children }: AuthCardProps) {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${title} · ${t("appName")}`;
  }, [title, t]);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <EnvironmentStrip environment={environment} />
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
          <img src={logo} alt={t("appName")} className="mb-6 h-10 w-auto" />
          <h1 className="mb-6 text-title font-semibold tracking-[-0.01em] text-foreground">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}
