import { tuesday } from "../requests";
import { type Api, apiAs } from "./session";

export interface RequestFields {
  type: "annual" | "sick" | "exceptional" | "permission" | "remote";
  start_date: string;
  end_date?: string;
  comment?: string;
  submit?: boolean;
}

/** What these helpers read of a request (`RequestOut`). */
export interface RequestRow {
  public_id: string;
  version: number;
  status: string;
  comment: string | null;
}

interface Paginated<T> {
  results: T[];
}

export async function createRequest(api: Api, fields: RequestFields): Promise<RequestRow> {
  const { submit = true, ...rest } = fields;
  const draft = await api.send<RequestRow>("post", "/requests", {
    end_date: rest.start_date, starts_at_midday: false, ends_at_midday: false, start_time: null,
    end_time: null, exceptional_event: null, comment: "", ...rest,
  });
  if (!submit) return draft;
  return api.send<RequestRow>("post", `/requests/${draft.public_id}/submit`, { version: draft.version });
}

/** Decides the step of `publicId` that waits in the caller's queue. */
export async function decideNext(api: Api, queue: "mine" | "hr", publicId: string,
                                 decision: "approve" | "reject" | "return" = "approve", comment = ""): Promise<void> {
  const page = await api.get<Paginated<{ step_id: number; request: RequestRow }>>("/approvals", { queue, page_size: "100" });
  const item = page.results.find((entry) => entry.request.public_id === publicId);
  if (!item) throw new Error(`request ${publicId} is not in the '${queue}' queue`);
  await api.send("post", `/steps/${item.step_id}/decide`, { decision, comment, version: item.request.version });
}

/** Approves a request of employee.a1 or employee.a2: their manager, then HR. */
export async function approveFully(baseURL: string, publicId: string): Promise<void> {
  await decideNext(await apiAs(baseURL, "manager"), "mine", publicId);
  await decideNext(await apiAs(baseURL, "hr"), "hr", publicId);
}

export interface Fixtures {
  ownerEmployee: string;      // public_id of the record of employee.a1
  ownerAccount: string;       // public_id of the account of employee.a1
  pending: string;            // a request of employee.a1 waiting for the manager
  draft: string;              // a draft of employee.a1
  approved: string;           // an approved, future request of employee.a1
}

const MARK = "Audit";
let cached: Fixtures | undefined;

/** Creates, once per database, the items that pages with an identifier need. Safe to call again. */
export async function ensureFixtures(baseURL: string): Promise<Fixtures> {
  if (cached) return cached;
  const owner = await apiAs(baseURL, "owner");
  const sysadmin = await apiAs(baseURL, "sysadmin");
  const me = await owner.get<{ email: string; employee: { public_id: string } }>("/auth/me");
  const mine = (await owner.get<Paginated<RequestRow>>("/requests", { scope: "mine", page_size: "100" })).results
    .filter((request) => (request.comment ?? "").startsWith(MARK));
  const find = (status: string) => mine.find((request) => request.status === status)?.public_id;

  let pending = find("pending");
  if (!pending) {
    pending = (await createRequest(owner, { type: "remote", start_date: tuesday(60), comment: `${MARK} en attente` })).public_id;
  }
  let draft = find("draft");
  if (!draft) {
    draft = (await createRequest(owner, { type: "remote", start_date: tuesday(62), comment: `${MARK} brouillon`, submit: false })).public_id;
  }
  let approved = find("approved");
  if (!approved) {
    approved = (await createRequest(owner, { type: "remote", start_date: tuesday(64), comment: `${MARK} approuvée` })).public_id;
    await approveFully(baseURL, approved!);
  }
  const accounts = await sysadmin.get<Paginated<{ public_id: string }>>("/accounts", { search: me.email });
  cached = {
    ownerEmployee: me.employee.public_id,
    ownerAccount: accounts.results[0].public_id,
    pending: pending!, draft: draft!, approved: approved!,
  };
  return cached;
}
