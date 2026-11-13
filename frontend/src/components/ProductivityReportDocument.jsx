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
  if (!rows || rows.length === 0) return <p className="text-xs text-slate-400 italic">None recorded</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse tabular-nums">
        <thead>
          <tr>
            {fields.map((f) => (
              <th key={f.key} className="border border-slate-300 bg-slate-100 px-2 py-1 text-left font-medium text-slate-600 whitespace-nowrap">{f.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {fields.map((f) => (
                <td key={f.key} className="border border-slate-300 px-2 py-1 text-slate-900 align-top">{r[f.key] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Box({ letter, title, children, mgmt = false }) {
  return (
    <section className={`border rounded-md p-3 mb-3 break-inside-avoid ${mgmt ? "border-blue-300 bg-blue-50/40" : "border-slate-300"}`}>
      <h3 className="flex items-center text-xs font-bold tracking-wide uppercase text-slate-800 mb-2">
        {letter && (
          <span className="inline-grid place-items-center w-5 h-5 rounded bg-brand-900 text-white text-[11px] mr-2 shrink-0">{letter}</span>
        )}
        {title}
      </h3>
      {children}
    </section>
  );
}

function KV({ label, value }) {
  return (
    <div className="flex gap-2 text-sm py-0.5 items-baseline">
      <span className="text-slate-500 w-44 shrink-0">{label}</span>
      <span className="text-slate-900 font-semibold flex-1 min-w-0 break-words">{value || value === 0 ? value : "—"}</span>
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div className="flex gap-2 text-sm items-baseline">
      <span className="text-slate-500 w-28 shrink-0">{label}</span>
      <span className="text-slate-900 font-semibold flex-1 min-w-0 border-b border-slate-200 break-words">{value || value === 0 ? value : " "}</span>
    </div>
  );
}

function SignSlot({ name, caption }) {
  const isImage = typeof name === "string" && name.startsWith("data:");
  return (
    <div className="text-xs">
      <div className="h-12 border-b border-slate-400 flex items-end pb-0.5">
        {isImage
          ? <img src={name} alt="signature" className="max-h-11 object-contain" />
          : name && <span style={{ fontFamily: "'Segoe Script','Brush Script MT',cursive", fontSize: "18px" }} className="text-slate-900">{name}</span>}
      </div>
      <div className="text-slate-500 mt-1">{caption}</div>
    </div>
  );
}

export default function ProductivityReportDocument({ report: r }) {
  return (
    <div className="bg-white text-slate-900 max-w-3xl mx-auto p-6 print:p-0 print:max-w-none">
      <div className="text-center mb-4 border-b-2 border-brand-900 pb-3">
        <img src="/logo.png" alt="One Touch Electrical Services" className="h-14 mx-auto mb-2 object-contain" />
        <h1 className="text-lg font-bold tracking-wide text-brand-900">ONE TOUCH ELECTRICAL SERVICES</h1>
        <h2 className="text-xs font-semibold tracking-wider text-slate-500 mt-0.5">DAILY EMPLOYEE PRODUCTIVITY &amp; WORK REPORT</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-7 gap-y-1 mb-4">
        <Meta label="Employee" value={r.employeeName || r.submittedBy?.name} />
        <Meta label="Employee ID" value={r.employeeIdNumber} />
        <Meta label="Project / Site" value={r.project?.name} />
        <Meta label="Department" value={r.department} />
        <Meta label="Date" value={r.reportDate && new Date(r.reportDate).toLocaleDateString()} />
        <Meta label="Position" value={r.position} />
        <Meta label="Supervisor" value={r.supervisorName} />
        <Meta label="Shift" value={r.shift} />
        <Meta label="Site location" value={r.siteLocation} />
        <Meta label="Status" value={r.status} />
      </div>

      <Box letter="A" title="Daily Work Targets">
        <LineTable fields={WORK_TARGET_FIELDS} rows={r.workTargets} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 mt-2">
          <KV label="Total target" value={r.totalTarget} />
          <KV label="Total completed" value={r.totalCompleted} />
          <KV label="Achievement %" value={r.overallAchievementPercent != null ? `${r.overallAchievementPercent}%` : null} />
        </div>
      </Box>

      <Box letter="B" title="Work Completed Today">
        <p className="text-sm whitespace-pre-wrap">{r.workCompletedToday || "—"}</p>
      </Box>

      <Box letter="C" title="Work Not Completed">
        <LineTable fields={NOT_COMPLETED_FIELDS} rows={r.workNotCompleted} />
      </Box>

      <Box letter="D" title="Delays / Time Lost">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <KV label="Delay experienced?" value={r.delayExperienced ? "Yes" : "No"} />
          <KV label="Total delay (hrs)" value={r.totalDelayHours} />
        </div>
        <KV label="Categories" value={(r.delayCategories || []).join(", ")} />
        <div className="mt-2">
          <LineTable fields={DELAY_FIELDS} rows={r.delays} />
        </div>
      </Box>

      <Box letter="E" title="Materials / Tools Required">
        <LineTable fields={MATERIALS_FIELDS} rows={r.materialsRequired} />
      </Box>

      <Box letter="F" title="Quality Check">
        <KV label="Completed to standard?" value={labelFor(QUALITY_OPTIONS, r.qualityStandardMet)} />
        <KV label="Rework / correction" value={r.reworkDetails} />
      </Box>

      <Box letter="G" title="End-of-Day Summary">
        <div className="grid grid-cols-2 gap-x-6">
          <KV label="Normal hours" value={r.normalHours} />
          <KV label="Actual hours worked" value={r.actualHoursWorked} />
          <KV label="Productive hours" value={r.productiveHours} />
          <KV label="Delay hours" value={r.delayHours} />
        </div>
        <KV label="Overtime requested?" value={r.overtimeRequested ? `Yes (${r.overtimeHoursRequested ?? 0} hrs)` : "No"} />
        {r.overtimeRequested && (
          <>
            <KV label="Reason" value={r.overtimeReason} />
            <KV label="Expected output" value={r.expectedOvertimeOutput} />
          </>
        )}
      </Box>

      <Box letter="H" title="Tomorrow's Plan">
        <LineTable fields={TOMORROW_FIELDS} rows={r.tomorrowPlan} />
      </Box>

      <Box letter="I" title="Employee Declaration">
        <p className="text-xs text-slate-500 mb-2">
          I confirm that the information in this report is accurate and represents the work performed during the working day.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SignSlot name={r.employeeSignatureName} caption="Employee signature" />
          <SignSlot name={r.submittedAt && new Date(r.submittedAt).toLocaleString()} caption="Time submitted" />
        </div>
      </Box>

      <Box letter="J" title="Supervisor Review">
        {!r.reviewedBy && <p className="text-xs text-slate-400 italic mb-1">To be completed by the supervisor.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <KV label="Target achievement %" value={r.targetAchievementPercent != null ? `${r.targetAchievementPercent}%` : null} />
          <KV label="Productivity rating" value={labelFor(PRODUCTIVITY_RATINGS, r.productivityRating)} />
          <KV label="Delay justified?" value={r.delayJustified} />
          <KV label="Overtime recommendation" value={labelFor(OVERTIME_RECOMMENDATIONS, r.overtimeRecommendation)} />
        </div>
        <KV label="Comments" value={r.supervisorComments} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
          <SignSlot name={r.supervisorSignatureName || r.reviewedBy?.name} caption="Supervisor signature" />
          <SignSlot name={r.reviewedAt && new Date(r.reviewedAt).toLocaleDateString()} caption="Date" />
        </div>
      </Box>

      <Box letter="K" title="Daily Productivity Control" mgmt>
        {!r.finalizedBy && <p className="text-xs text-slate-400 italic mb-1">To be completed by the supervisor.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <KV label="Target achievement" value={r.targetAchievementPercent != null ? `${r.targetAchievementPercent} %` : null} />
          <KV label="Productivity score" value={r.productivityScore != null ? `${r.productivityScore} / 100` : null} />
          <KV label="Productive hours" value={r.productiveHours} />
          <KV label="Delay hours" value={r.delayHours} />
          <KV label="Overtime approved" value={r.overtimeHoursApproved != null ? `${r.overtimeHoursApproved} hrs` : null} />
          <KV label="Overtime cost" value={r.overtimeCost != null ? `$${r.overtimeCost}` : null} />
        </div>
      </Box>

      <Box letter="L" title="Management Action / Follow-up" mgmt>
        <KV label="Action" value={(r.managementActions || []).map((a) => labelFor(MANAGEMENT_ACTIONS, a)).join(", ")} />
        <KV label="Signed off by" value={r.finalizedBy?.name} />
      </Box>
    </div>
  );
}
