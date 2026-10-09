import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const base = 'btn';
  const classes = `${base} ${base}--${variant} ${className}`.trim();
  return <button className={classes} {...props} />;
}