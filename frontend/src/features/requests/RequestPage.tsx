import { useParams } from "react-router";
import { backToList } from "@/components";
import { useRequest } from "./api";
import { Gate } from "./Gate";
import { useWorkspacePrefix } from "./platform";
import { RequestView } from "./RequestView";
import type { RequestDetail } from "./types";
import { VIEWS } from "./views/registry";

function ReadOnlyView({ request }: { request: RequestDetail }) {
  const prefix = useWorkspacePrefix();
  return <RequestView request={request} back={backToList(`/${prefix}/requests`)} />;
}

/** /<workspace>/requests/:id : one request, presented from the viewer's angle. */
export default function RequestPage() {
  const { id = "" } = useParams();
  const prefix = useWorkspacePrefix();
  const query = useRequest(id);
  return (
    // The views open sheets (a file, a decision, an HR action) over this reading.
    <Gate query={query} form>
      {(request) => {
        // Overview is read-only whatever the viewer could do elsewhere (UI 8): a request opened
        // there is shown with the overview's view, and decisions are taken in My team.
        const relation = prefix === "overview" ? "overview" : request.viewer.relation;
        const View = VIEWS[relation] ?? ReadOnlyView;
        return <View request={request} />;
      }}
    </Gate>
  );
}
