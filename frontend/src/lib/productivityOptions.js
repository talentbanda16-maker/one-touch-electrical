export const QUALITY_OPTIONS = [
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
  { value: "REQUIRES_CORRECTION", label: "Requires correction" },
];

export const DELAY_CATEGORIES = [
  "MATERIAL",
  "SUPERVISOR",
  "OTHER_DEPT",
  "EQUIPMENT",
  "TRANSPORT",
  "CLIENT_SITE",
  "POWER",
  "SAFETY",
  "EMPLOYEE",
  "OTHER",
];

export const PRODUCTIVITY_RATINGS = [
  { value: "EXCELLENT", label: "90–100 Excellent" },
  { value: "GOOD", label: "75–89 Good" },
  { value: "ATTENTION", label: "60–74 Attention" },
  { value: "CRITICAL", label: "<60 Critical" },
];

export const DELAY_JUSTIFIED = ["YES", "NO", "PARTIAL"];

export const OVERTIME_RECOMMENDATIONS = [
  { value: "APPROVED", label: "Approved" },
  { value: "NOT_APPROVED", label: "Not approved" },
  { value: "NA", label: "N/A" },
];

export const MANAGEMENT_ACTIONS = [
  { value: "NO_ACTION", label: "No action required" },
  { value: "EMPLOYEE_COACHING", label: "Employee coaching required" },
  { value: "INVESTIGATE_DELAYS", label: "Investigate repeated delays" },
  { value: "MATERIAL_PROCUREMENT", label: "Material / procurement issue" },
  { value: "PROJECT_PLANNING", label: "Project planning issue" },
  { value: "HR_REVIEW", label: "HR / management review" },
];

export const WORK_TARGET_FIELDS = [
  { key: "task", label: "Task / activity" },
  { key: "unit", label: "Unit" },
  { key: "target", label: "Target", type: "number" },
  { key: "actual", label: "Actual", type: "number" },
  { key: "startTime", label: "Start time", type: "time" },
  { key: "endTime", label: "End time", type: "time" },
];
export const NOT_COMPLETED_FIELDS = [
  { key: "task", label: "Task" },
  { key: "remainingWork", label: "Remaining work" },
  { key: "reason", label: "Reason not completed" },
];
export const DELAY_FIELDS = [
  { key: "time", label: "Time", type: "time" },
  { key: "duration", label: "Duration (hrs)", type: "number" },
  { key: "reason", label: "Reason" },
  { key: "cause", label: "Who / what caused it" },
];
export const MATERIALS_FIELDS = [
  { key: "item", label: "Item" },
  { key: "qtyRequired", label: "Qty required", type: "number" },
  { key: "available", label: "Available", type: "number" },
  { key: "shortage", label: "Shortage", type: "number" },
];
export const TOMORROW_FIELDS = [
  { key: "task", label: "Planned task" },
  { key: "targetQuantity", label: "Target quantity" },
  { key: "materialsRequired", label: "Materials / support required" },
];

export function labelFor(list, value) {
  const found = list.find((o) => o.value === value);
  return found ? found.label : value;
}
