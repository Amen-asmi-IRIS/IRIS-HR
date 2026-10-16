export interface HrSettingsSubject {
  id: string;
  /** The absolute address of the subject's page. */
  path: string;
  /** Fully qualified translation keys, "namespace:key". */
  titleKey: string;
  descriptionKey: string;
  /** Subjects are listed in ascending order. */
  order: number;
}

/** One entry per subject of the HR settings (UI 7.12). A plan that adds a subject pushes it here. */
export const HR_SETTINGS_SUBJECTS: HrSettingsSubject[] = [
  {
    id: "departments",
    path: "/hr/settings/departments",
    titleKey: "employees:settingsIndex.departments.title",
    descriptionKey: "employees:settingsIndex.departments.description",
    order: 60,
  },
];

// The subjects of the request engine (plan 03b), before departments (60).
HR_SETTINGS_SUBJECTS.push(
  {
    id: "request-types",
    path: "/hr/settings/request-types",
    titleKey: "requests:settingsIndex.types.title",
    descriptionKey: "requests:settingsIndex.types.description",
    order: 10,
  },
  {
    id: "steps",
    path: "/hr/settings/steps",
    titleKey: "requests:settingsIndex.steps.title",
    descriptionKey: "requests:settingsIndex.steps.description",
    order: 20,
  },
  {
    id: "events",
    path: "/hr/settings/events",
    titleKey: "requests:settingsIndex.events.title",
    descriptionKey: "requests:settingsIndex.events.description",
    order: 30,
  },
  {
    id: "holidays",
    path: "/hr/settings/holidays",
    titleKey: "requests:settingsIndex.holidays.title",
    descriptionKey: "requests:settingsIndex.holidays.description",
    order: 40,
  },
  {
    id: "parameters",
    path: "/hr/settings/parameters",
    titleKey: "requests:settingsIndex.parameters.title",
    descriptionKey: "requests:settingsIndex.parameters.description",
    order: 50,
  },
);
