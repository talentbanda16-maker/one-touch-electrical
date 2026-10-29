import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const HAZARDS = [
  { hazard: "Flying particles",   risk: "Eye impact injuries" },
  { hazard: "Dust",               risk: "Respiratory infection" },
  { hazard: "Rotating disc",      risk: "Entanglement and impact injuries" },
  { hazard: "Sharp edges",        risk: "Cuts and abrasion injuries" },
  { hazard: "Electricity",        risk: "Electrical shock and electrocution" },
  { hazard: "Awkward positioning",risk: "Muscular stress, sprains, strains" },
  { hazard: "Vibration",          risk: "Personal injury and fatigue" },
];

const PPE = [
  "Eye protection (safety goggles / safety glasses)",
  "Safety footwear",
  "Hair containment for long and loose hair",
  "Hearing protection (earmuffs)",
  "Respiratory protection (respirator)",
  "Head protection (hard hats)",
  "Loose clothing and jewelry must NOT be worn",
];

const PRE_OP = [
  "Ensure you are familiar with the angle grinder controls and how they operate.",
  "Ensure the handles and guard are fitted, secure and functional — do not operate if the handle is missing or faulty.",
  "Ensure lighting is adequate for the task.",
  "Check the disc for damage, cracks, excessive or uneven wear.",
  "Remove the energy source (isolation) of the angle grinder before replacing the disc.",
  "Complete any required permits (e.g. hot work permits).",
];

const OPERATIONAL = [
  "Ensure the item or material being worked on is secure.",
  "Always keep both hands on the angle grinder to control its movement.",
  "Avoid applying excessive force to the disc.",
  "Maintain the grinding disc at 30° angle to the work where possible.",
  "Always grind so sparks are directed away from your body; never direct sparks toward another person.",
  "Ensure that nearby workers wear eye protection when in close vicinity of cutting and grinding.",
  "If experiencing excessive vibration, take breaks to reduce exposure.",
  "Always wear a respirator or dust mask if dust or particles are being generated.",
];

const TASK_COMPLETION = [
  "Tools and other work items should be returned to storage locations.",
  "All hazards and risks must be controlled prior to leaving the work area.",
  "Close the hot work permit if required.",
  "Ensure that the work area is left clean and tidy.",
  "Communicate information on any newly identified hazard or risk.",
];

const WALL_GRINDING = [
  "Inspect the tool: verify the wheel or cup is rated for concrete; check for cracks or wear and ensure the guard and side handle are tightly secured.",
  "Maintain two-handed control: grip both handles firmly before powering on — wall torque can easily pull a single-handed grinder out of position.",
  "Allow the grinder to reach full operational speed before touching it to the wall.",
  "Apply steady, light pressure: do not jam or force the disc into mortar or concrete; let the abrasive action do the work to prevent kickback.",
  "Never set the grinder down until the disc has completely stopped spinning.",
  "Disconnect the power source before changing wheels.",
];

const METAL_CUTTING = [
  "Inspect the tool: check the grinder, guard, handle and power cord (battery casing) for any damage, fraying or cracks.",
  "Ensure the safety guard is tightly attached and positioned between you and the wheel.",
  "Remove all flammable materials within a 10-metre radius and ensure a fire extinguisher is nearby.",
  "Don the full PPE: safety glasses, full-face shield, gloves, hearing protection and respirator. Tuck in loose clothing, tie back long hair and remove jewelry.",
  "Ensure the piece being cut off will fall away freely so it does not pinch or bind the blade (causes dangerous kickback).",
  "Perform a test run: turn the tool on and let it run at full speed for 30–60 seconds away from your body.",
  "Maintain a firm two-handed grip at all times — one hand on the body switch and one on the side handle.",
  "For cutting, hold the tool at 90° to the workpiece and let the wheel slice through without bending or twisting.",
  "Do not force the tool — let the weight and speed do the work; excessive pressure can shatter the wheel or stall the motor.",
  "Angle the tool so sparks fly downward and away from your body, face and cords.",
  "Release the trigger and hold the tool firmly until the disc stops spinning before setting it down.",
  "Disconnect the power or remove the battery before changing disc or leaving the workstation.",
  "Sweep up metal shavings and debris; monitor the area after finishing to ensure no sparks cause a fire.",
];

function SectionCard({ title, color = "slate", children }) {
  const header = {
    slate: "bg-brand-900 text-white",
    red:   "bg-red-700 text-white",
    blue:  "bg-blue-700 text-white",
    green: "bg-brand-600 text-white",
    amber: "bg-amber-600 text-white",
  }[color];
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`px-4 py-3 ${header}`}>
        <p className="text-sm font-bold">{title}</p>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

function BulletList({ items }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-slate-700">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function GrinderProcedure() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      <div className="bg-brand-900 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 text-xl leading-none">←</button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-slate-800">Angle Grinder Safe Operating Procedure</h1>
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
                  ANGLE GRINDER SAFE OPERATING PROCEDURE
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

        {/* Aim */}
        <SectionCard title="Aim" color="slate">
          <p className="text-sm text-slate-700 leading-relaxed">
            The aim of this procedure is to eliminate or minimize the potential for fatalities, injuries and incidents arising from risks associated with the use and operation of grinders.
          </p>
        </SectionCard>

        {/* Scope */}
        <SectionCard title="Scope" color="slate">
          <p className="text-sm text-slate-700 leading-relaxed">
            The procedure applies to the use of battery, pneumatic and electrically powered angle grinders. It will be applied to all One Touch Electrical and Construction Services operations, including its contractors and business partners.
          </p>
        </SectionCard>

        {/* Responsibilities */}
        <SectionCard title="Responsibilities" color="blue">
          <ul className="space-y-2 text-sm text-slate-700">
            <li><span className="font-semibold text-slate-800">General Manager (GM):</span> Ensure the procedure is implemented and adhered to in all departmental operations.</li>
            <li><span className="font-semibold text-slate-800">SHEQ Officer(s):</span> Maintain the procedure.</li>
            <li><span className="font-semibold text-slate-800">HODs / Site Supervisors / Section Foremen:</span> Responsible for the implementation of this procedure.</li>
            <li><span className="font-semibold text-slate-800">Grinder Operators:</span> Must be competent and able to communicate in a common language.</li>
          </ul>
        </SectionCard>

        {/* Definitions */}
        <SectionCard title="Definitions" color="slate">
          <dl className="space-y-2 text-sm">
            {[
              ["Angle Grinder", "A versatile handheld power tool used for cutting, grinding and polishing."],
              ["Competent Person", "A person who has the right training and experience to be regarded as competent under legal requirements and/or internal regulations."],
              ["Permit", "Formal system required for specific tasks or activities (e.g. working at heights), whereby a permit must be issued prior to the start of activities."],
              ["Procedure", "Documented process detailing the requirements for conducting an activity or task."],
              ["Training", "Initial training to verify competence and subsequent refresher training to verify that competence has been retained."],
            ].map(([term, def]) => (
              <div key={term} className="flex gap-2">
                <dt className="font-bold text-slate-800 flex-shrink-0 w-36">{term}</dt>
                <dd className="text-slate-600">{def}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>

        {/* Hazards & Risks */}
        <SectionCard title="Potential Hazards & Risks" color="red">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-red-50">
                  <th className="border border-red-200 px-3 py-2 text-left font-bold text-red-800">Hazard</th>
                  <th className="border border-red-200 px-3 py-2 text-left font-bold text-red-800">Risk</th>
                </tr>
              </thead>
              <tbody>
                {HAZARDS.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-red-50/40"}>
                    <td className="border border-red-100 px-3 py-2 text-slate-700 font-medium">{row.hazard}</td>
                    <td className="border border-red-100 px-3 py-2 text-slate-700">{row.risk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* PPE */}
        <SectionCard title="Mandatory Personal Protective Equipment" color="amber">
          <ul className="space-y-2">
            {PPE.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="flex-shrink-0 text-amber-600 font-black mt-0.5">✓</span>
                <span className={item.includes("NOT") ? "font-semibold text-red-700" : ""}>{item}</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        {/* Pre-Operational */}
        <SectionCard title="Pre-Operational Safety Checks" color="blue">
          <BulletList items={PRE_OP} />
        </SectionCard>

        {/* Operational */}
        <SectionCard title="Operational Use" color="green">
          <BulletList items={OPERATIONAL} />
        </SectionCard>

        {/* Task Completion */}
        <SectionCard title="Task Completion" color="slate">
          <BulletList items={TASK_COMPLETION} />
        </SectionCard>

        {/* Wall Grinding */}
        <SectionCard title="Wall Grinding" color="blue">
          <BulletList items={WALL_GRINDING} />
        </SectionCard>

        {/* Metal & DB Cutting */}
        <SectionCard title="Metal and DB Cutting" color="red">
          <BulletList items={METAL_CUTTING} />
        </SectionCard>

        {/* Emergency preparedness */}
        <SectionCard title="Emergency Preparedness" color="red">
          <p className="text-sm text-slate-700 leading-relaxed">
            In the event of an emergency involving the angle grinder (fire, electrical shock, injury), immediately isolate the power source. Raise the alarm and follow the site emergency response plan. Administer first aid only if trained and safe to do so. Report all incidents to the SHEQ Officer and site supervisor immediately.
          </p>
        </SectionCard>

      </div>
    </div>
  );
}
