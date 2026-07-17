import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  isLoading?: boolean;
  children: ReactNode;
}

export const Button = ({ variant = "primary", isLoading, children, className, disabled, ...rest }: ButtonProps) => {
  return (
    <button
      className={[styles.button, styles[variant], className].filter(Boolean).join(" ")}
      disabled={disabled || isLoading}
      {...rest}
    >
      {isLoading ? <span className={styles.spinner} aria-hidden /> : null}
      {children}
    </button>
  );
};
