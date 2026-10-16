import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, call } from "@/api/client";
import type {
  ArchivePreview,
  Department,
  DepartmentChanges,
  DepartmentPayload,
  Departure,
  Employee,
  EmployeeBrief,
  EmployeeChanges,
  EmployeeDetail,
  EmployeeDocument,
  EmployeePayload,
  EmployeeQuery,
  EmployeeRow,
  Position,
  PositionChanges,
  PositionPayload,
  TeamMember,
} from "@/api/types";

export type {
  ArchivePreview,
  Department,
  Employee,
  EmployeeBrief,
  EmployeeChanges,
  EmployeeDetail,
  EmployeeDocument,
  EmployeePayload,
  EmployeeRow,
  Position,
  TeamMember,
};
export type EmployeeListParams = EmployeeQuery;

export const employeeKeys = {
  all: ["employees"] as const,
  list: (params: EmployeeListParams) => ["employees", "list", params] as const,
  detail: (id: string) => ["employees", "detail", id] as const,
  me: ["employees", "me"] as const,
  directory: ["employees", "directory"] as const,
  documents: (id: string) => ["employees", "documents", id] as const,
  history: (id: string, page: number) => ["employees", "history", id, page] as const,
  archivePreview: (id: string) => ["employees", "archive-preview", id] as const,
};

export const structureKeys = {
  all: ["structure"] as const,
  departments: ["structure", "departments"] as const,
  positions: ["structure", "positions"] as const,
};

/** The whole record has an employee number; the team view a manager receives does not. */
export function isFullRecord(employee: EmployeeDetail): employee is Employee {
  return "employee_number" in employee;
}

// --- Reading ----------------------------------------------------------------------------------

export function useEmployees(params: EmployeeListParams) {
  return useQuery({
    queryKey: employeeKeys.list(params),
    queryFn: () => call(api.GET("/api/v1/employees", { params: { query: params } })),
    placeholderData: keepPreviousData,
  });
}

export function useEmployee(id: string | undefined) {
  return useQuery({
    queryKey: employeeKeys.detail(id ?? ""),
    queryFn: () => call(api.GET("/api/v1/employees/{public_id}", { params: { path: { public_id: id ?? "" } } })),
    enabled: Boolean(id),
  });
}

export function useMyEmployee(enabled = true) {
  return useQuery({
    queryKey: employeeKeys.me,
    queryFn: () => call(api.GET("/api/v1/employees/me")),
    enabled,
  });
}

export function useEmployeeDirectory() {
  return useQuery({
    queryKey: employeeKeys.directory,
    queryFn: () => call(api.GET("/api/v1/employees/directory")),
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: structureKeys.departments,
    queryFn: () => call(api.GET("/api/v1/departments")),
  });
}

export function usePositions() {
  return useQuery({
    queryKey: structureKeys.positions,
    queryFn: () => call(api.GET("/api/v1/positions")),
  });
}

export function useEmployeeDocuments(id: string) {
  return useQuery({
    queryKey: employeeKeys.documents(id),
    queryFn: () =>
      call(api.GET("/api/v1/employees/{public_id}/documents", { params: { path: { public_id: id } } })),
  });
}

export function useEmployeeHistory(id: string, page: number) {
  return useQuery({
    queryKey: employeeKeys.history(id, page),
    queryFn: () =>
      call(
        api.GET("/api/v1/employees/{public_id}/history", {
          params: { path: { public_id: id }, query: { page } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useArchivePreview(id: string) {
  return useQuery({
    queryKey: employeeKeys.archivePreview(id),
    queryFn: () =>
      call(api.GET("/api/v1/employees/{public_id}/archive-preview", { params: { path: { public_id: id } } })),
  });
}

// --- Writing ----------------------------------------------------------------------------------

/** Every write on an employee changes lists, records and histories: refresh them all. */
function useRefreshEmployees() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: employeeKeys.all });
}

export function useCreateEmployee() {
  const refresh = useRefreshEmployees();
  return useMutation({
    mutationFn: (body: EmployeePayload) => call(api.POST("/api/v1/employees", { body })),
    onSuccess: refresh,
  });
}

export function useUpdateEmployee(id: string) {
  const refresh = useRefreshEmployees();
  return useMutation({
    mutationFn: (body: EmployeeChanges) =>
      call(api.PATCH("/api/v1/employees/{public_id}", { params: { path: { public_id: id } }, body })),
    onSuccess: refresh,
  });
}

export function useArchiveEmployee(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Departure) =>
      call(api.POST("/api/v1/employees/{public_id}/archive", { params: { path: { public_id: id } }, body })),
    // A departure also ends delegations. On a refusal (someone else recorded it) the record is read again too.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: employeeKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["delegations"] }),
      ]),
  });
}

function useRefreshStructure() {
  const queryClient = useQueryClient();
  // Department and position names appear on employee lists and records.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: structureKeys.all }),
      queryClient.invalidateQueries({ queryKey: employeeKeys.all }),
    ]);
}

export function useSaveDepartment() {
  const refresh = useRefreshStructure();
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: DepartmentPayload | DepartmentChanges }): Promise<Department> =>
      id === undefined
        ? call(api.POST("/api/v1/departments", { body: body as DepartmentPayload }))
        : call(api.PATCH("/api/v1/departments/{id}", { params: { path: { id } }, body })),
    onSuccess: refresh,
  });
}

export function useSavePosition() {
  const refresh = useRefreshStructure();
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: PositionPayload | PositionChanges }): Promise<Position> =>
      id === undefined
        ? call(api.POST("/api/v1/positions", { body: body as PositionPayload }))
        : call(api.PATCH("/api/v1/positions/{id}", { params: { path: { id } }, body })),
    onSuccess: refresh,
  });
}

export interface NewDocument {
  file: File;
  label: string;
  visible_to_employee: boolean;
}

/** The multipart body of `POST employees/{id}/documents`. */
export function documentFormData(input: NewDocument): FormData {
  const form = new FormData();
  form.append("file", input.file);
  form.append("label", input.label);
  form.append("visible_to_employee", String(input.visible_to_employee));
  return form;
}

export function useAddDocument(id: string) {
  const refresh = useRefreshEmployees();
  return useMutation({
    mutationFn: (input: NewDocument) =>
      call(
        api.POST("/api/v1/employees/{public_id}/documents", {
          params: { path: { public_id: id } },
          // The generated type describes the file part as a string; the browser sends the File itself,
          // and openapi-fetch leaves the Content-Type to the browser when the body is a FormData.
          body: { file: "", label: input.label, visible_to_employee: input.visible_to_employee },
          bodySerializer: () => documentFormData(input),
        }),
      ),
    onSuccess: refresh,
  });
}

export function useSetDocumentVisibility(id: string) {
  const refresh = useRefreshEmployees();
  return useMutation({
    mutationFn: (change: { id: number; visible_to_employee: boolean }) =>
      call(
        api.PATCH("/api/v1/employees/{public_id}/documents/{id}", {
          params: { path: { public_id: id, id: change.id } },
          body: { visible_to_employee: change.visible_to_employee },
        }),
      ),
    onSuccess: refresh,
  });
}
