/**
 * Stand-ins for `@/lib/format`, so a test can assert on a whole sentence without depending on a locale.
 * Use: vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
 */
export const formatMock = {
  formatDate: (value: string) => `D(${value})`,
  formatDateRange: (start: string, end: string) => `R(${start}..${end})`,
  formatDateTime: (value: string) => `T(${value})`,
  formatDays: (value: string | number) => `${Number(value)} j`,
  formatHours: (value: string | number) => `${Number(value)} h`,
};

/** The real module with the five functions above replaced, so that code using the others still works. */
export async function mockedFormat(importOriginal: () => Promise<unknown>) {
  return { ...((await importOriginal()) as object), ...formatMock };
}
