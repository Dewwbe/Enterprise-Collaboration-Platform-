import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

const fieldClasses =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-400';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldClasses, className)} {...props} />
  ),
);
Input.displayName = 'Input';

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

/** Label + control + error/hint, the shape every form field in the app uses. */
export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export { fieldClasses };
