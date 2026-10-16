import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

interface OversightFrameProps {
  /** Where "back" leads: the Oversight index or one of its two hubs. */
  back: string;
  children: ReactNode;
}

export function OversightFrame({ back, children }: OversightFrameProps) {
  const { t } = useTranslation("reports");
  return (
    <>
      <Link to={back} className="mb-2 inline-flex min-h-11 items-center gap-2 text-body font-medium text-primary hover:underline md:min-h-0">
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t("oversight.back")}
      </Link>
      {children}
    </>
  );
}
