"use client";

import { useId } from "react";
import { Field } from "./field";
import { Input, type InputProps } from "./input";
import { Label } from "./label";

export interface TextFieldProps extends Omit<InputProps, "id" | "invalid"> {
  label: string;
  /** Optional helper text shown below the control. */
  description?: string;
  /** Error message. When present the control is marked invalid. */
  error?: string;
  /** Explicit id; falls back to a generated stable id when omitted. */
  id?: string;
}

export function TextField({
  label,
  description,
  error,
  id,
  required,
  className,
  ...props
}: TextFieldProps) {
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
      <Input
        id={fieldId}
        required={required}
        invalid={invalid}
        aria-describedby={describedBy}
        className={className}
        {...props}
      />
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
