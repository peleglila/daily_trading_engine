import React from 'react';
import { HelpCircle } from 'lucide-react';
import { FIELD_HELP } from './fieldHelpCopy';

type FieldHelpProps = {
  fieldId: string;
  label: string;
  className?: string;
  labelClassName?: string;
};

/**
 * Label + hover/focus help panel. Uses central FIELD_HELP copy.
 */
export function FieldHelp({ fieldId, label, className = '', labelClassName = '' }: FieldHelpProps) {
  const tip = FIELD_HELP[fieldId] || 'No help text for this field yet.';
  return (
    <div className={`inline-flex items-center gap-1 group relative ${className}`}>
      <span className={labelClassName || 'text-xs font-bold text-slate-500 uppercase'}>{label}</span>
      <button
        type="button"
        tabIndex={0}
        aria-label={`Help: ${label}`}
        className="text-slate-400 hover:text-indigo-600 focus:text-indigo-600 focus:outline-none"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      <div
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-50 mt-1 w-64 max-w-[80vw] rounded-md border border-slate-200 bg-slate-900 px-3 py-2 text-[11px] font-normal normal-case leading-snug text-slate-100 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {tip}
      </div>
    </div>
  );
}

export function HelpIcon({ fieldId, className = '' }: { fieldId: string; className?: string }) {
  const tip = FIELD_HELP[fieldId] || 'No help text for this field yet.';
  return (
    <span className={`inline-flex relative group ${className}`}>
      <button
        type="button"
        tabIndex={0}
        aria-label="Help"
        className="text-slate-400 hover:text-indigo-600 focus:text-indigo-600 focus:outline-none"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      <div
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-slate-200 bg-slate-900 px-3 py-2 text-[11px] leading-snug text-slate-100 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {tip}
      </div>
    </span>
  );
}
