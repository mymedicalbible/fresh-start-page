import React, { useState } from 'react';

interface CollapsibleGridProps {
  title: string;
  data: { [key: string]: any, count: number }[];
  labelKey: string;
}

// Helper component
export const CollapsibleGrid: React.FC<CollapsibleGridProps> = ({ title, data, labelKey }) => {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = expanded ? data : data.slice(0, 3);

  return (
    <div className="bg-white p-6 rounded-[32px] shadow-sm mb-6 border border-slate-50">
      <h3 className="font-bold text-slate-800 mb-4">{title}</h3>
      <div className="space-y-3">
        {visibleItems.map((item: any, idx: number) => (
          <div key={idx} className="flex justify-between items-center text-sm">
            <span className="text-slate-600 font-medium">{item[labelKey]}</span>
            <span className="font-bold text-slate-900 bg-slate-50 px-3 py-1 rounded-full text-[10px] border border-slate-100">
              {item.count} LOGS
            </span>
          </div>
        ))}
      </div>
      {data.length > 3 && (
        <button 
          onClick={() => setExpanded(!expanded)}
          className="w-full mt-4 text-[10px] font-black text-indigo-500 uppercase tracking-widest pt-3 border-t border-slate-50"
        >
          {expanded ? "Collapse List" : `+ View ${data.length - 3} More Triggers`}
        </button>
      )}
    </div>
  );
};

// Main Page component
const AnalyticsPage = () => {
  return (
    <div className="p-4 bg-slate-50 min-h-screen pb-24">
       <h1 className="text-2xl font-bold mb-6 px-2">Trends & Spikes</h1>
       {/* You will place your data-fetching logic and CollapsibleGrids here */}
       <div className="bg-white p-8 rounded-[2rem] text-center text-slate-400 italic">
          Analytics data loading...
       </div>
    </div>
  );
};

export default AnalyticsPage;