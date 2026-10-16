import type { ReactNode } from "react";
import { useSearchParams } from "react-router";
import { EmptyState, PageHeader } from "@/components";
import { cn } from "@/lib/utils";
import { RequestsList } from "../lists/RequestsList";
import { useRequestsText } from "../platform";

function ViewButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-md px-3 text-body font-medium sm:min-h-8",
        active ? "bg-card text-foreground" : "text-text-secondary",
      )}
    >
      {children}
    </button>
  );
}

/** /team/requests (UI 6.4): the team's requests in any state, and a second view of what the viewer decided. */
export default function TeamRequestsPage() {
  const { t } = useRequestsText();
  const [search, setSearch] = useSearchParams();
  const decided = search.get("view") === "decided";
  const show = (view: "team" | "decided") => setSearch(view === "decided" ? { view: "decided" } : {});

  return (
    <>
      <PageHeader title={t("teamList.title")} />
      <div role="group" aria-label={t("teamList.viewLabel")} className="mb-4 inline-flex gap-1 rounded-md bg-accent p-1">
        <ViewButton active={!decided} onClick={() => show("team")}>
          {t("teamList.viewTeam")}
        </ViewButton>
        <ViewButton active={decided} onClick={() => show("decided")}>
          {t("teamList.viewDecided")}
        </ViewButton>
      </div>
      <RequestsList
        key={decided ? "decided" : "team"}
        label={t("teamList.title")}
        scope={decided ? "decided" : "team"}
        columns={["who", "type", "when", "quantity", "status"]}
        filters={["employee", "status", "period"]}
        empty={<EmptyState title={t(decided ? "teamList.emptyDecided" : "teamList.empty")} hint={t("teamList.emptyHint")} />}
      />
    </>
  );
}
