import {
  QUALITY_OPTIONS,
  PRODUCTIVITY_RATINGS,
  OVERTIME_RECOMMENDATIONS,
  MANAGEMENT_ACTIONS,
  WORK_TARGET_FIELDS,
  NOT_COMPLETED_FIELDS,
  DELAY_FIELDS,
  MATERIALS_FIELDS,
  TOMORROW_FIELDS,
  labelFor,
} from "../lib/productivityOptions";

function LineTable({ fields, rows }) {
  if (!rows || rows.length === 0) return <p className="text-sm text-slate-400 italic">None recorded</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse border border-slate-300">
        <thead>
          <tr className="bg-slate-100">
            {fields.map((f) => (
              <th key={f.key} className="border border-slate-300 px-2 py-1 text-left font-medium text-slate-700">{f.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {fields.map((f) => (
                <td key={f.key} className="border border-slate-300 px-2 py-1 text-slate-900">{r[f.key] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Box({ letter, title, children }) {
  return (
    <section className="border border-slate-300 rounded-md p-3 mb-3 break-inside-avoid">
      <h3 className="text-sm font-bold text-slate-800 mb-2 uppercase tracking-wide">
        {letter ? `${letter}. ` : ""}{title}
      </h3>
      {children}
    </section>
  );
}

function Meta({ label, value }) {
  return (
    <div className="flex flex-wrap text-sm gap-x-2">
      <span className="text-slate-500 w-40 shrink-0">{label}</span>
      <span className="text-slate-900 font-medium border-b border-slate-300 flex-1 min-w-[4rem] break-words">{value || value === 0 ? value : " "}</span>
    </div>
  );
}

export default function ProductivityReportDocument({ report: r }) {
  return (
    <div className="bg-white text-slate-900 max-w-3xl mx-auto p-6 print:p-0 print:max-w-none">
      <div className="text-center mb-4 border-b-2 border-slate-800 pb-3">
        <h1 className="text-lg font-bold tracking-wide">ONE TOUCH ELECTRICAL SERVICES</h1>
        <h2 className="text-sm font-semibold text-slate-700">DAILY EMPLOYEE PRODUCTIVITY &amp; WORK REPORT</h2>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-4">
        <Meta label="Employee" value={r.submittedBy?.name} />
        <Meta label="Employee ID" value={r.employeeIdNumber} />
        <Meta label="Project" value={r.project?.name} />
        <Meta label="Department" value={r.department} />
        <Meta label="Date" value={r.reportDate && new Date(r.reportDate).toLocaleDateString()} />
        <Meta label="Position" value={r.position} />
        <Meta label="Site location" value={r.siteLocation} />
        <Meta label="Shift" value={r.shift} />
        <Meta label="Supervisor" value={r.supervisorName} />
        <Meta label="Status" value={r.status} />
      </div>

      <Box letter="A" title="Daily work targets">
        <LineTable fields={WORK_TARGET_FIELDS} rows={r.workTargets} />
        <div className="space-y-1 mt-2">
          <Meta label="Total target" value={r.totalTarget} />
          <Meta label="Total completed" value={r.totalCompleted} />
          <Meta label="Achievement %" value={r.overallAchievementPercent} />
        </div>
      </Box>

      <Box letter="B" title="Work completed today">
        <p className="text-sm whitespace-pre-wrap">{r.workCompletedToday || "—"}</p>
      </Box>

      <Box letter="C" title="Work not completed">
        <LineTable fields={NOT_COMPLETED_FIELDS} rows={r.workNotCompleted} />
      </Box>

      <Box letter="D" title="Delays / time lost">
        <Meta label="Delay experienced" value={r.delayExperienced ? "Yes" : "No"} />
        <Meta label="Total delay (hrs)" value={r.totalDelayHours} />
        <Meta label="Categories" value={(r.delayCategories || []).join(", ")} />
        <div className="mt-2">
          <LineTable fields={DELAY_FIELDS} rows={r.delays} />
        </div>
      </Box>

      <Box letter="E" title="Materials / tools required">
        <LineTable fields={MATERIALS_FIELDS} rows={r.materialsRequired} />
      </Box>

      <Box letter="F" title="Quality check">
        <Meta label="Standard met" value={labelFor(QUALITY_OPTIONS, r.qualityStandardMet)} />
        <Meta label="Rework details" value={r.reworkDetails} />
      </Box>

      <Box letter="G" title="End-of-day summary">
        <div className="grid grid-cols-2 gap-3">
          <Meta label="Normal hours" value={r.normalHours} />
          <Meta label="Actual hours worked" value={r.actualHoursWorked} />
          <Meta label="Productive hours" value={r.productiveHours} />
          <Meta label="Delay hours" value={r.delayHours} />
        </div>
        <Meta label="Overtime requested" value={r.overtimeRequested ? `Yes (${r.overtimeHoursRequested ?? 0} hrs)` : "No"} />
        {r.overtimeRequested && (
          <>
            <Meta label="Reason" value={r.overtimeReason} />
            <Meta label="Expected output" value={r.expectedOvertimeOutput} />
          </>
        )}
      </Box>

      <Box letter="H" title="Tomorrow's plan">
        <LineTable fields={TOMORROW_FIELDS} rows={r.tomorrowPlan} />
      </Box>

      <Box letter="I" title="Employee declaration">
        <p className="text-xs text-slate-500 mb-2">
          I confirm that the information in this report is accurate and represents the work performed during the working day.
        </p>
        <Meta label="Employee signature" value={r.employeeSignatureName} />
      </Box>

      {r.reviewedBy && (
        <Box letter="J" title="Supervisor review">
          <Meta label="Target achievement %" value={r.targetAchievementPercent} />
          <Meta label="Productivity rating" value={labelFor(PRODUCTIVITY_RATINGS, r.productivityRating)} />
          <Meta label="Delay justified" value={r.delayJustified} />
          <Meta label="Overtime recommendation" value={labelFor(OVERTIME_RECOMMENDATIONS, r.overtimeRecommendation)} />
          <Meta label="Comments" value={r.supervisorComments} />
          <Meta label="Supervisor signature" value={r.supervisorSignatureName} />
        </Box>
      )}

      {r.finalizedBy && (
        <>
          <Box letter="K" title="Daily productivity control (Management use)">
            <Meta label="Productivity score" value={r.productivityScore} />
            <Meta label="Overtime hours approved" value={r.overtimeHoursApproved} />
            <Meta label="Overtime cost" value={r.overtimeCost != null ? `$${r.overtimeCost}` : ""} />
          </Box>
          <Box letter="L" title="Management action / follow-up">
            <p className="text-sm mb-2">
              {(r.managementActions || []).map((a) => labelFor(MANAGEMENT_ACTIONS, a)).join(", ") || "—"}
            </p>
            <Meta label="Signed off by" value={r.finalizedBy?.name} />
          </Box>
        </>
      )}
    </div>
  );
}
