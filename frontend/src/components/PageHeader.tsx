import { ArrowLeft } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, type To } from "react-router";

interface PageHeaderProps {
  title: string;
  /** The page's one primary action. */
  primary?: ReactNode;
  back?: To;
  /** A short line under the title. */
  children?: ReactNode;
}

export function PageHeader({ title, primary, back, children }: PageHeaderProps) {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${title} · ${t("appName")}`;
  }, [title, t]);

  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {back !== undefined && (
          <Link to={back} className="mb-2 inline-flex min-h-11 items-center gap-2 text-body font-medium text-primary hover:underline md:min-h-0">
            <ArrowLeft aria-hidden="true" className="size-4" />
            {t("actions.back")}
          </Link>
        )}
        <h1 className="text-title font-semibold tracking-[-0.01em] text-foreground">{title}</h1>
        {children && <div className="mt-1 text-body text-text-secondary">{children}</div>}
      </div>
      {primary && <div className="shrink-0">{primary}</div>}
    </header>
  );
}
