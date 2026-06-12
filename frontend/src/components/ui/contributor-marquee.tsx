interface Contributor {
  name: string;
  role: string;
  initials: string;
  gradient: string;
}

const contributors: Contributor[] = [
  { name: 'Dr. Rohan Shah', role: 'AIIMS Delhi • Pathology Lead', initials: 'RS', gradient: 'from-teal-400 to-emerald-500' },
  { name: 'Priya Sharma', role: 'OSS Core Developer', initials: 'PS', gradient: 'from-blue-500 to-indigo-600' },
  { name: 'Dr. Ananya Nair', role: 'KEM Mumbai • Pharmacology', initials: 'AN', gradient: 'from-purple-500 to-pink-500' },
  { name: 'Dr. Vivek Gupta', role: 'MAMC Delhi • Anatomy Specialist', initials: 'VG', gradient: 'from-orange-400 to-red-500' },
  { name: 'Rahul Verma', role: 'Local Storage & Sync Architect', initials: 'RV', gradient: 'from-cyan-400 to-blue-500' },
  { name: 'Dr. Meera Iyer', role: 'VMMC Delhi • Microbiology', initials: 'MI', gradient: 'from-fuchsia-500 to-purple-600' },
  { name: 'Dr. Sneha Patil', role: 'JIPMER • Physiology Editor', initials: 'SP', gradient: 'from-rose-400 to-pink-600' },
  { name: 'Amit Das', role: 'React 19 Security & Auth', initials: 'AD', gradient: 'from-amber-400 to-orange-500' },
  { name: 'Dr. Aditya Sen', role: 'AIIMS Rishikesh • Surgery Qs', initials: 'AS', gradient: 'from-emerald-400 to-teal-600' },
  { name: 'Dr. Ritu Choudhary', role: 'LHMC Delhi • Gynae Reviewer', initials: 'RC', gradient: 'from-violet-500 to-indigo-500' },
];

export function ContributorMarquee() {
  // Duplicate list to ensure seamless looping marquee effect
  const doubleContributors = [...contributors, ...contributors];

  return (
    <div className="relative w-full overflow-hidden bg-clay-surface-soft py-6 border-y border-clay-hairline">
      {/* Soft gradient overlays to fade the edges out */}
      <div className="absolute inset-y-0 left-0 w-12 sm:w-24 bg-gradient-to-r from-clay-surface-soft to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-12 sm:w-24 bg-gradient-to-l from-clay-surface-soft to-transparent z-10 pointer-events-none" />

      <div className="animate-marquee gap-8 items-center">
        {doubleContributors.map((c, i) => (
          <div
            key={i}
            className="flex items-center gap-3 bg-clay-canvas border border-clay-hairline rounded-[9999px] pl-3 pr-5 py-1.5 hover:bg-clay-surface-card transition-all duration-300 group select-none shrink-0"
          >
            <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${c.gradient} flex items-center justify-center text-xs font-bold text-white shadow-inner group-hover:scale-105 transition-transform duration-300`}>
              {c.initials}
            </div>
            <div className="flex flex-col text-left">
              <span className="text-sm font-semibold text-clay-ink transition-colors duration-300">
                {c.name}
              </span>
              <span className="text-xs text-clay-muted font-medium">
                {c.role}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
