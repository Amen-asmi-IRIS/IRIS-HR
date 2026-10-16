import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface PagerProps {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}

export function Pager({ page, pageSize, total, onPage }: PagerProps) {
  const { t } = useTranslation();
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  return (
    <nav aria-label={t("list.pagination")} className="mt-4 flex items-center justify-end gap-3">
      {page > 1 && (
        <Button size="icon" aria-label={t("list.previous")} onClick={() => onPage(page - 1)}>
          <ChevronLeft aria-hidden="true" />
        </Button>
      )}
      <p className="text-body text-muted-foreground">{t("list.page", { page, pages })}</p>
      {page < pages && (
        <Button size="icon" aria-label={t("list.next")} onClick={() => onPage(page + 1)}>
          <ChevronRight aria-hidden="true" />
        </Button>
      )}
    </nav>
  );
}
