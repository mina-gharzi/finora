"use client";

import type { ReactNode, SelectHTMLAttributes } from "react";
import { useId } from "react";
import { Field } from "./field";
import { Label } from "./label";
import { Select } from "./select";

export interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "invalid"> {
  label: string;
  description?: string;
  error?: string;
  id?: string;
  children: ReactNode;
}

export function SelectField({
  label,
  description,
  error,
  id,
  required,
  className,
  children,
  ...props
}: SelectFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const descriptionId = description ? `${fieldId}-description` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy =
    [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
  const invalid = Boolean(error);

  return (
    <Field>
      <Label htmlFor={fieldId}>
        {label}
        {required && (
          <span className="text-danger" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </Label>
      <Select
        id={fieldId}
        required={required}
        invalid={invalid}
        aria-describedby={describedBy}
        className={className}
        {...props}
      >
        {children}
      </Select>
      {description && (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-center gap-1.5 text-sm text-danger">
          <span
            aria-hidden="true"
            className="inline-block size-1.5 rounded-full bg-danger"
          />
          {error}
        </p>
      )}
    </Field>
  );
}
