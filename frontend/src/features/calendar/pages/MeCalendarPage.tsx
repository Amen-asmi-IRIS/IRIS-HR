import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { PageHeader } from "@/components";
import { Button } from "@/components/ui/button";

import { useCalendar } from "../api";
import { CalendarToolbar } from "../CalendarToolbar";
import { CalendarView } from "../CalendarView";
import { rangeFor, toIso } from "../model";
import { useCalendarState } from "../useCalendarState";

export default function MeCalendarPage() {
  const { t } = useTranslation("calendar");
  const navigate = useNavigate();
  const { view, anchor, setView, setAnchor } = useCalendarState();
  const { from, to } = rangeFor(view, anchor);
  // No filter is ever sent in this scope: the server would ignore it anyway.
  const calendar = useCalendar({ from: toIso(from), to: toIso(to), scope: "department" });
  if (calendar.error) {
    throw calendar.error;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("title")}
        primary={
          <Button asChild variant="primary">
            <Link to="/me/requests/new">{t("newRequest")}</Link>
          </Button>
        }
      >
        {t("hint.department")}
      </PageHeader>
      <CalendarToolbar view={view} anchor={anchor} onViewChange={setView} onAnchorChange={setAnchor} />
      <CalendarView feed={calendar.data} isLoading={calendar.isPending} view={view} anchor={anchor}
                    onAnchorChange={setAnchor} onDayAction={(iso) => navigate(`/me/requests/new?start=${iso}`)} />
    </div>
  );
}
