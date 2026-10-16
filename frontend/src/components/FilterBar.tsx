import { Children, useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface FilterBarProps {
  /** At most three filters. */
  children: ReactNode;
  /** Further filters, one step away. */
  more?: ReactNode;
}

export function FilterBar({ children, more }: FilterBarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const id = useId();
  if (Children.toArray(children).length > 3) {
    throw new Error("At most three filters are visible (UI rule M5). Pass the others as `more`.");
  }
  return (
    <form role="search" aria-label={t("filters.label")} className="mb-4 flex flex-col gap-3" onSubmit={(event) => event.preventDefault()}>
      <div className="flex flex-wrap items-end gap-3">
        {children}
        {more && (
          <Button variant="ghost" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
            {open ? t("filters.fewer") : t("filters.more")}
          </Button>
        )}
      </div>
      {more && open && (
        <div id={id} className="flex flex-wrap items-end gap-3">
          {more}
        </div>
      )}
    </form>
  );
}
