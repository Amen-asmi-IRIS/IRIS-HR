import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface TaskSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Buttons. A submit button here carries form="<id of the form in children>". */
  footer?: ReactNode;
}

/** A focused task: a 480px sheet on the right, the whole screen on a phone. */
export function TaskSheet({ open, onOpenChange, title, description, children, footer }: TaskSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent closeLabel={t("actions.close")} {...(description ? {} : { "aria-describedby": undefined })}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <SheetBody>{children}</SheetBody>
        {footer && <SheetFooter>{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}
