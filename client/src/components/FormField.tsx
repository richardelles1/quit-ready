import { forwardRef } from "react";
import { UseFormRegisterReturn } from "react-hook-form";

interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
  error?: string;
  prefix?: string;
  suffix?: string;
  registration: UseFormRegisterReturn;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, description, error, prefix, suffix, registration, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        <label className="text-sm font-semibold text-foreground">
          {label}
        </label>
        {description && (
          <p className="text-sm text-muted-foreground mb-1">{description}</p>
        )}
        <div className="relative flex items-center">
          {prefix && (
            <span className="absolute left-4 text-muted-foreground font-medium select-none">
              {prefix}
            </span>
          )}
          <input
            {...registration}
            {...props}
            className={`
              w-full rounded-md border border-input bg-background px-4 py-3 text-base shadow-sm
              transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium
              placeholder:text-muted-foreground 
              focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring
              disabled:cursor-not-allowed disabled:opacity-50
              ${prefix ? 'pl-8' : ''}
              ${suffix ? 'pr-12' : ''}
              ${error ? 'border-destructive focus-visible:ring-destructive' : ''}
              ${className || ''}
            `}
          />
          {suffix && (
            <span className="absolute right-4 text-muted-foreground font-medium select-none">
              {suffix}
            </span>
          )}
        </div>
        {error && (
          <p className="text-sm font-medium text-destructive mt-1">{error}</p>
        )}
      </div>
    );
  }
);
FormField.displayName = "FormField";

interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  description?: string;
  error?: string;
  options: { label: string; value: string }[];
  registration: UseFormRegisterReturn;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, description, error, options, registration, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        <label className="text-sm font-semibold text-foreground">
          {label}
        </label>
        {description && (
          <p className="text-sm text-muted-foreground mb-1">{description}</p>
        )}
        <select
          {...registration}
          {...props}
          className={`
            w-full rounded-md border border-input bg-background px-4 py-3 text-base shadow-sm
            transition-colors
            focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring
            disabled:cursor-not-allowed disabled:opacity-50
            ${error ? 'border-destructive focus-visible:ring-destructive' : ''}
            ${className || ''}
          `}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="text-sm font-medium text-destructive mt-1">{error}</p>
        )}
      </div>
    );
  }
);
SelectField.displayName = "SelectField";
