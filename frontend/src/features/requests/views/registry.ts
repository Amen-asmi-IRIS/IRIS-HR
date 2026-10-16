import type { ComponentType } from "react";
import type { RequestDetail, ViewerRelation } from "../types";
import RequestHrView from "./RequestHrView";
import RequestManagerView from "./RequestManagerView";
import RequestMineView from "./RequestMineView";
import RequestOverviewView from "./RequestOverviewView";

export type RequestViewComponent = ComponentType<{ request: RequestDetail }>;

/**
 * The view of a request for each relation of the viewer to it (R3).
 * A task adds its view by adding a line. A relation without a line gets the read-only view.
 */
export const VIEWS: Partial<Record<ViewerRelation, RequestViewComponent>> = {
  owner: RequestMineView,
  approver: RequestManagerView,
  team: RequestManagerView,
  hr: RequestHrView,
  overview: RequestOverviewView,
};
