import type { FieldProblem } from "@/api/problem";
import type { Department, Employee, EmployeeDocument, EmployeeRow, Position, TeamMember } from "@/api/types";
import { makePage, problemResponse } from "@/test/fixtures";

export const pageOf = makePage;

/** A problem answer from the list of its field problems; the first one gives the general message. */
export function problem(status: number, code: string, errors: Partial<FieldProblem>[] = []) {
  return problemResponse(status, code, errors[0]?.detail ?? "", errors);
}

export function makeDepartment(overrides: Partial<Department> = {}): Department {
  return {
    id: 1,
    code: "UW",
    name_fr: "Souscription",
    name_en: "Underwriting",
    name: "Souscription",
    is_active: true,
    employee_count: 3,
    ...overrides,
  };
}

export function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    id: 4,
    code: "OFF",
    title_fr: "Chargé de clientèle",
    title_en: "Account officer",
    title: "Chargé de clientèle",
    grade: "C1",
    is_active: true,
    employee_count: 4,
    ...overrides,
  };
}

const department = { id: 1, code: "UW", name: "Souscription" };
const position = { id: 4, code: "OFF", title: "Chargé de clientèle" };

export function makeTeamMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    public_id: "emp-1",
    first_name: "Amal",
    last_name: "Employee",
    name: "Amal Employee",
    department,
    position,
    professional_email: "employee.a1@impactrisks.com",
    phone: "20 123 456",
    ...overrides,
  };
}

export function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    ...makeTeamMember(),
    employee_number: "E004",
    date_of_birth: "1992-04-11",
    gender: "female",
    personal_email: "",
    address: "",
    hire_date: "2021-06-01",
    contract_start_date: null,
    contract_end_date: null,
    contract_type: "permanent",
    status: "active",
    manager: { public_id: "emp-3", name: "Mounir Manager" },
    emergency_contact_name: "",
    emergency_contact_phone: "",
    archived_at: null,
    archive_reason: "",
    has_account: true,
    created_at: "2026-10-01T09:00:00+01:00",
    updated_at: "2026-10-01T09:00:00+01:00",
    ...overrides,
  };
}

export function makeEmployeeRow(overrides: Partial<EmployeeRow> = {}): EmployeeRow {
  return {
    public_id: "emp-1",
    name: "Amal Employee",
    department,
    position,
    professional_email: "employee.a1@impactrisks.com",
    phone: "20 123 456",
    employee_number: "E004",
    manager: { public_id: "emp-3", name: "Mounir Manager" },
    status: "active",
    ...overrides,
  };
}

export function makeDocument(overrides: Partial<EmployeeDocument> = {}): EmployeeDocument {
  return {
    id: 11,
    label: "Contrat",
    visible_to_employee: false,
    attachment: { public_id: "att-1", name: "contrat.pdf", size: 52, content_type: "application/pdf" },
    added_by: "Senna RH",
    added_at: "2026-10-02T10:00:00+01:00",
    ...overrides,
  };
}
