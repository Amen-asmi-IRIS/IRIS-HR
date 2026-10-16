import { Navigate, useParams } from "react-router";
import { useRequest } from "./api";
import { Gate } from "./Gate";
import { useViewer, workspaceFor } from "./platform";

/**
 * /requests/:id : the address used by notifications and links (UI 11). It opens the request in
 * the workspace that matches the viewer, so the shell shows that workspace's navigation.
 */
export default function RequestRedirect() {
  const { id = "" } = useParams();
  const viewer = useViewer();
  const query = useRequest(id);
  return (
    <Gate query={query}>
      {(request) => (
        <Navigate to={`/${workspaceFor(request.viewer.relation, viewer.workspaces)}/requests/${id}`} replace />
      )}
    </Gate>
  );
}
