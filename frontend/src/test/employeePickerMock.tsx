interface PickerProps {
  label: string;
  value: string | null;
  onChange: (publicId: string | null) => void;
  hint?: string;
  error?: string;
}

/**
 * Stand-in for plan 02's `EmployeePicker` in unit tests of other features: a text input in which
 * the test types a `public_id`, followed by the hint and the error the real picker would show.
 * Use: vi.mock("@/features/employees/EmployeePicker", async () => (await import("@/test/employeePickerMock")).employeePickerMock);
 */
export const employeePickerMock = {
  EmployeePicker: ({ label, value, onChange, hint, error }: PickerProps) => (
    <div>
      <label>
        {label}
        <input value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)} />
      </label>
      {hint && <p>{hint}</p>}
      {error && <p>{error}</p>}
    </div>
  ),
};
