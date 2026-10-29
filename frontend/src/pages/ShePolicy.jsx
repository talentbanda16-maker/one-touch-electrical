import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const COMMITMENTS = [
  "Fulfil the QMS ISO 9001:2015, EMS ISO 14001:2015 and ISO 45001:2018 requirements.",
  "Business processes review and continual improvement, in order to increase its effectiveness and efficiency.",
  "Assure and control the quality of our business processes, in order to promote the business values such as transparency, innovation, team work, employee motivation & development, integrity, professionalism and safety so as to continually improve the business processes of Quality, Environment, Health & Safety.",
  "Deliver our mandates and business commitments through eco-friendly business processes with the minimum environmental impacts and also protect the lives of our valued customers, employees, and visitors with a serious elimination of any occurrence of health and safety related risks or hazards.",
  "Adhere to all relevant and applicable local and international regulations that affect or may be affected by our business processes, products and services.",
  "Manage a professional customer service efficiently and to offer fast, error free and modern services to our customers, in order to delight them.",
  "Manage the customers' complaints efficiently and independently, in order to assure its non-occurrence in future and to drive the improvement process.",
  "Engage and consult with the concerned parties on health and safety issues and methods to ensure knowledge, assessment and monitoring of workplace risks.",
];

export default function ShePolicy() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      {/* Top bar */}
      <div className="bg-brand-900 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 text-xl leading-none">←</button>
        <div>
          <h1 className="text-base font-bold text-slate-800">SHEQ Policy</h1>
          <p className="text-xs text-slate-500">{user?.name}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-4">

        {/* Document header — exact layout */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-xs border-collapse">
            <tbody>
              {/* Row 1: Logo | SHEQ MANAGEMENT SYSTEM title */}
              <tr>
                <td rowSpan={3} className="border border-slate-300 p-2 text-center align-middle w-28">
                  <img src="/logo.png" alt="One Touch Electrical & Construction Services" className="w-24 mx-auto" />
                </td>
                <td colSpan={2} className="border border-slate-300 px-3 py-2 font-black text-base text-slate-800 text-center align-middle">
                  SHEQ MANAGEMENT SYSTEM
                </td>
              </tr>
              {/* Row 2: SHEQ MANAGEMENT POLICY subtitle */}
              <tr>
                <td colSpan={2} className="border border-slate-300 px-3 py-2 font-bold text-green-600 text-center align-middle">
                  SHEQ MANAGEMENT POLICY
                </td>
              </tr>
              {/* Row 3: Initializing Department | Page */}
              <tr>
                <td className="border border-slate-300 px-3 py-2 text-slate-700 align-middle">
                  <span className="font-semibold">Initializing Department: SHEQ Department</span>
                </td>
                <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-600 text-center align-middle w-24">
                  Page
                </td>
              </tr>
              {/* Row 4: Document No | All Departments | Page 1 of 2 */}
              <tr>
                <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-600 align-middle">
                  Document No:
                </td>
                <td className="border border-slate-300 px-3 py-2 text-slate-700 align-middle">
                  All Departments
                </td>
                <td className="border border-slate-300 px-3 py-2 text-slate-500 text-center align-middle">
                  Page 1 of 2
                </td>
              </tr>
              {/* Row 5: empty | Revision Number | Rev 01 */}
              <tr>
                <td className="border border-slate-300 px-3 py-2 align-middle"></td>
                <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-600 align-middle">
                  Revision Number:
                </td>
                <td className="border border-slate-300 px-3 py-2 text-slate-500 text-center align-middle">
                  Rev 01
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Body */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-5 space-y-4">
          <p className="text-sm text-slate-700 leading-relaxed">
            We at <strong>One Touch Electrical and Construction Services</strong> engage in electrical and solar
            installations, maintenance, testing and compliance services for residential, commercial and industrial
            projects. We acknowledge that inadequate management of our activities can result in personal injury,
            occupational diseases, excessive consumption of natural resources, habitat disruption and market loss
            among other business risks.
          </p>
          <p className="text-sm text-slate-700 leading-relaxed">
            We therefore approve subsequent policies, which are related to multiple ISO standards under a comprehensive
            policy — the <strong>Safety, Health, Environment and Quality Management System (SHEQ) Policy</strong> —
            as part of our mandate to include explicit delivery of the following commitments:
          </p>

          <ol className="space-y-3">
            {COMMITMENTS.map((c, i) => (
              <li key={i} className="flex gap-3 text-sm text-slate-700 leading-relaxed">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-900 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span>{c}</span>
              </li>
            ))}
          </ol>

          <p className="text-sm text-slate-700 leading-relaxed pt-2">
            Additionally, the leadership team undertakes to publish the SHEQ Policy through the available means
            to all interested parties such as employees (part time / full time), and to review it periodically.
          </p>
        </div>

        {/* Signatures */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-5">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">Authorisation</p>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-6">Managing Director</p>
              <div className="border-b border-slate-300 mb-1" />
              <p className="text-xs text-slate-400">Signature</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-6">Workers Committee Chairperson</p>
              <div className="border-b border-slate-300 mb-1" />
              <p className="text-xs text-slate-400">Signature</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
