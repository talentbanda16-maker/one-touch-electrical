import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function SectionCard({ title, color = "slate", children }) {
  const header = {
    slate: "bg-brand-900 text-white",
    blue:  "bg-blue-700 text-white",
    green: "bg-brand-600 text-white",
    amber: "bg-amber-600 text-white",
    red:   "bg-red-700 text-white",
  }[color];
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`px-4 py-3 ${header}`}>
        <p className="text-sm font-bold">{header && title}</p>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

function StepTable({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50">
            <th className="border border-slate-200 px-3 py-2 text-left font-bold text-slate-700 w-20">Step</th>
            <th className="border border-slate-200 px-3 py-2 text-left font-bold text-slate-700">Activity</th>
            <th className="border border-slate-200 px-3 py-2 text-left font-bold text-slate-700 w-32">By Who</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([step, activity, who], i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
              <td className="border border-slate-200 px-3 py-2 font-mono text-xs text-slate-500 align-top">{step}</td>
              <td className="border border-slate-200 px-3 py-2 text-slate-700 align-top">{activity}</td>
              <td className="border border-slate-200 px-3 py-2 text-slate-500 text-xs align-top">{who}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DocumentedInfoControl() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      <div className="bg-brand-900 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 text-xl leading-none">←</button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-slate-800">Documented Information Control Procedure</h1>
          <p className="text-xs text-slate-500">{user?.name}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-4">

        {/* Document header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-xs border-collapse">
            <tbody>
              <tr>
                <td rowSpan={3} className="border border-slate-300 p-2 text-center align-middle w-28">
                  <img src="/logo.png" alt="One Touch" className="w-24 mx-auto" />
                </td>
                <td colSpan={2} className="border border-slate-300 px-3 py-2 font-black text-base text-slate-800 text-center align-middle">
                  SHEQ MANAGEMENT SYSTEM
                </td>
              </tr>
              <tr>
                <td colSpan={2} className="border border-slate-300 px-3 py-2 font-bold text-green-600 text-center align-middle">
                  DOCUMENTED INFORMATION CONTROL PROCEDURE
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-700 align-middle">Initializing Department: SHEQ</td>
                <td className="border border-slate-300 px-3 py-2 text-slate-500 text-center align-middle w-24">Page 1 of 1</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-600 align-middle">Document No:</td>
                <td className="border border-slate-300 px-3 py-2 text-slate-700 align-middle">All Departments</td>
                <td className="border border-slate-300 px-3 py-2 text-slate-500 text-center align-middle">Rev 01</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Scope */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-brand-900 text-white"><p className="text-sm font-bold">Scope</p></div>
          <div className="px-4 py-4">
            <p className="text-sm text-slate-700 leading-relaxed">
              This SHEQ MS procedure is applicable to all employees and sub-contractors at One Touch Electrical and Construction Services operations. It provides a standard and holistic guideline on the layout, version control and authorisation of all documented information.
            </p>
          </div>
        </div>

        {/* Ownership */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-brand-900 text-white"><p className="text-sm font-bold">Process Ownership</p></div>
          <div className="px-4 py-4 space-y-2 text-sm">
            {[
              ["Process Owner",         "Management — All Operations"],
              ["Author",                "One Touch Electrical and Construction Services Management Team"],
              ["Responsible to adhere", "All Employees (Permanent & Contractors)"],
              ["Responsible to train",  "SHEQ Officer"],
              ["Verify document control","Supervisors & SHEQ Officers"],
              ["Review procedure",      "Management"],
            ].map(([label, val]) => (
              <div key={label} className="flex gap-2">
                <span className="font-semibold text-slate-800 w-40 flex-shrink-0">{label}:</span>
                <span className="text-slate-600">{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Approval team */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-blue-700 text-white"><p className="text-sm font-bold">Approval / Review Assessment Team</p></div>
          <div className="px-4 py-4 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-blue-50">
                  <th className="border border-blue-200 px-3 py-2 text-left font-bold text-blue-800">Name & Surname</th>
                  <th className="border border-blue-200 px-3 py-2 text-left font-bold text-blue-800">Occupation</th>
                  <th className="border border-blue-200 px-3 py-2 text-left font-bold text-blue-800">Role</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Praise Mhondera", "SHEQ Officer",    "Author"],
                  ["",                "Engineer",         "Checked by"],
                  ["",                "General Manager",  "Approved by"],
                  ["",                "Managing Director","Approved by"],
                ].map(([name, occ, role], i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-blue-50/40"}>
                    <td className="border border-blue-100 px-3 py-2 text-slate-700">{name}</td>
                    <td className="border border-blue-100 px-3 py-2 text-slate-700">{occ}</td>
                    <td className="border border-blue-100 px-3 py-2 text-slate-500 text-xs">{role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Introduction */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-brand-900 text-white"><p className="text-sm font-bold">Introduction</p></div>
          <div className="px-4 py-4">
            <p className="text-sm text-slate-700 leading-relaxed">
              This procedure describes how SHEQ MS documented information shall be controlled by way of review and approval before issue and distribution to all locations where needed, making changes/modifications/re-issues to documented information in a formalised manner, and retrieval of obsolete documented information to prevent its continued use.
            </p>
          </div>
        </div>

        {/* Definitions */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-brand-900 text-white"><p className="text-sm font-bold">Definitions &amp; Terms</p></div>
          <div className="px-4 py-4">
            <dl className="space-y-2 text-sm">
              {[
                ["SHEQ",                "Safety, Health, Environment and Quality."],
                ["SHEQ MS",             "Safety, Health, Environment and Quality Management System."],
                ["HOD",                 "Head of Department."],
                ["Retention Time",      "The time over which documented information is retained before it is disposed of."],
                ["Documented Information", "Information required to be controlled and maintained by an organisation and the medium on which it is contained."],
              ].map(([term, def]) => (
                <div key={term} className="flex gap-2">
                  <dt className="font-bold text-slate-800 flex-shrink-0 w-40">{term}</dt>
                  <dd className="text-slate-600">{def}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* 4.1 Layout */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-brand-600 text-white"><p className="text-sm font-bold">4.1 Layout</p></div>
          <div className="px-4 py-4">
            <StepTable rows={[
              ["4.1.1", "Use the following layout whenever possible for your procedures:\n• Purpose — Write the aim of the procedure.\n• Responsibility — Person with power to ensure implementation, revision and maintenance.\n• Scope — Define the coverage.\n• Definitions — Define key terms or abbreviations.\n• Description of Activities — Step-by-step events answering what, who and when.\n• Appendices — List attachment material.\n• Performance Indicators — Show extent of adherence to set goals.\n• Records — As determined from retained documented information procedure.\n• References — List sources of key information.", "Process Owner"],
            ]} />
          </div>
        </div>

        {/* 4.2 Numbering */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-brand-600 text-white"><p className="text-sm font-bold">4.2 Numbering</p></div>
          <div className="px-4 py-4">
            <StepTable rows={[
              ["4.2.1", "Main headings / paragraphs — Number using whole numbers, e.g. 5.", "Process Owner"],
              ["4.2.2", "Sub-headings — Number to 1 decimal place, e.g. 5.1", "Process Owner"],
              ["4.2.3", "Sub-sub-headings — Number to 2 decimal places, e.g. 5.1.1", "Process Owner"],
              ["4.2.4", "Numbering after 2nd decimal place — Use alphabet letters, e.g. 5.1.1(a)(b)…", "Process Owner"],
              ["4.2.5", "SHEQ MS procedures — Use prefix SHEQMSP followed by a number (01, 02 etc.).", "Process Owner"],
              ["4.2.6", "Departmental procedures — Use department prefix (e.g. Tech), followed by P, then number, then WI and work instruction number.", "Process Owner"],
            ]} />
          </div>
        </div>

        {/* 4.3 Control Parameters */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-brand-600 text-white"><p className="text-sm font-bold">4.3 Documented Information Control Parameters</p></div>
          <div className="px-4 py-4">
            <StepTable rows={[
              ["4.3.1", "Put the control parameters on top of each and every page.", "Process Owner"],
              ["4.3.2", "Procedure No. — Enter numbers as defined in 4.2.5 and 4.2.6.", "Process Owner"],
              ["4.3.3", "Title — Enter a title sufficiently descriptive to convey the correct idea of the document.", "Process Owner"],
              ["4.3.4", "Prepared by / Recommended / Approved by — Type names and obtain signatures in the respective spaces on the front page.", "Process Owner"],
              ["4.3.5", "Page No. — Enter in format 'page x of y', where x starts from 1.", "Process Owner"],
              ["4.3.6", "Revision No. — 0 (zero) for original; 1 after first revision; 2 after second revision, etc. Change on ALL pages even if only one page was revised.", "Process Owner"],
              ["4.3.7", "Issue Date — Enter date (dd/mm/yy) from which the document becomes effective.", "Process Owner"],
            ]} />
          </div>
        </div>

        {/* 4.4 Review & Approval */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-brand-600 text-white"><p className="text-sm font-bold">4.4 Review and Approval Prior to Issue</p></div>
          <div className="px-4 py-4">
            <StepTable rows={[
              ["4.4.1", "Take the draft document to the respective HOD first, then to the General Manager for review and approval. SHEQ Management documents go to the Engineer for review and then to the General Manager / Managing Director.", "Process Owner"],
              ["4.4.2", "Keep the approved documents as hard or soft copy files.", "Process Owner"],
            ]} />
          </div>
        </div>

        {/* 4.5 Issue / Distribution */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-brand-600 text-white"><p className="text-sm font-bold">4.5 Issue / Distribution</p></div>
          <div className="px-4 py-4">
            <StepTable rows={[
              ["4.5.1", "Put documents in a file with a contents list page and distribute where needed.", "Process Owner"],
              ["4.5.2", "Maintain a Document Distribution List and get each recipient to sign for their copy.", "Process Owner"],
              ["4.5.3", "Maintain a register of forms and records used.", "Process Owner"],
            ]} />
          </div>
        </div>

        {/* 4.6 Changes */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-brand-600 text-white"><p className="text-sm font-bold">4.6 Documented Information Changes</p></div>
          <div className="px-4 py-4">
            <StepTable rows={[
              ["4.6.1", "Any recipient with a constructive suggestion for change must record it on the Management of Change Control form.", "Process Owner"],
              ["4.6.2", "Make the proposed change(s).", "Process Owner"],
              ["4.6.3", "Forward changes together with the Document Amendment Request Form for review and approval by the same function responsible for the original review.", "Process Owner"],
              ["4.6.4", "Do the amendment(s) as approved.", "Process Owner"],
              ["4.6.5", "Update all manuals, checking against the relevant distribution list.", "Process Owner"],
              ["4.6.6", "Destroy the obsolete document(s).", "Process Owner"],
              ["4.6.7", "Retain documented information of the change/modification.", "Process Owner"],
            ]} />
          </div>
        </div>

        {/* 4.7 Revision Status */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-brand-600 text-white"><p className="text-sm font-bold">4.7 Identification of Current Revision Status</p></div>
          <div className="px-4 py-4">
            <StepTable rows={[
              ["4.7.1", "Enter the revision number and issue date (starting at 0 for the original) on the Revision Status table.", "Process Owner"],
              ["4.7.2", "Amend the revision number and issue date on the Contents List page whenever they change.", "Process Owner"],
            ]} />
          </div>
        </div>

        {/* 4.8 External Origin */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-brand-600 text-white"><p className="text-sm font-bold">4.8 Documented Information of External Origin</p></div>
          <div className="px-4 py-4">
            <StepTable rows={[
              ["4.8.1", "Procure required external standards, specifications, codes of practice and legislation; record on the Register of Documented Information of External Origin.", "Process Owner"],
              ["4.8.2", "Make copies for distribution where necessary and maintain a distribution list.", "Process Owner"],
              ["4.8.3", "Track revisions by obtaining up-to-date catalogues from publishers, requesting information about updates/amendments, and updating the register.", "Process Owner"],
            ]} />
          </div>
        </div>

        {/* 4.9 Obsolete */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-red-700 text-white"><p className="text-sm font-bold">4.9 Invalid / Obsolete Documented Information</p></div>
          <div className="px-4 py-4">
            <StepTable rows={[
              ["4.9.1", "Withdraw and destroy invalid/obsolete documents, or retain for reference purposes only (clearly marked as obsolete).", "Process Owner"],
            ]} />
          </div>
        </div>

        {/* 4.10 Periodic Reviews */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-brand-600 text-white"><p className="text-sm font-bold">4.10 Periodic Reviews</p></div>
          <div className="px-4 py-4">
            <StepTable rows={[
              ["4.10.1", "Review SHEQ MS documents as an integral part of the input to management reviews.", "Process Owner"],
              ["4.10.2", "The functions responsible for the original review and approval must also review and approve the periodic reviews.", "Process Owner"],
            ]} />
          </div>
        </div>

        {/* Appendices */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-brand-900 text-white"><p className="text-sm font-bold">Appendices</p></div>
          <div className="px-4 py-4">
            <ul className="space-y-1 text-sm text-slate-700">
              {["File Contents List", "Document Distribution List", "Register of Documented Information of External Origin Form", "Management of Change Control Form"].map((item, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Retained documented information */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-blue-700 text-white"><p className="text-sm font-bold">Retained Documented Information</p></div>
          <div className="px-4 py-4 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-blue-50">
                  {["Identification","Location","Access Authority","Retention","Disposal"].map(h => (
                    <th key={h} className="border border-blue-200 px-2 py-2 text-left font-bold text-blue-800">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["File Contents List",                       "SHE Office", "GM / ISO Champion", "2 yrs", "Shred/recycle"],
                  ["Document Distribution List",               "SHE Office", "GM / ISO Champion", "5 yrs", "Shred/recycle"],
                  ["Register of Documented Information",       "SHE Office", "GM / ISO Champion", "5 yrs", "Shred/recycle"],
                  ["Register of Docs of External Origin",      "SHE Office", "GM / ISO Champion", "5 yrs", "Shred/recycle"],
                  ["Management of Change Control",             "SHE Office", "GM / ISO Champion", "5 yrs", "Shred/recycle"],
                ].map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-blue-50/40"}>
                    {row.map((cell, j) => (
                      <td key={j} className="border border-blue-100 px-2 py-2 text-slate-700">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* References */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-brand-900 text-white"><p className="text-sm font-bold">References</p></div>
          <div className="px-4 py-4">
            <ul className="space-y-1 text-sm text-slate-700">
              <li>• ISO 9001:2015, clause 7.5</li>
              <li>• ISO 14001:2015, clause 7.5</li>
              <li>• ISO 45001:2018, clause 7.5</li>
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
}
