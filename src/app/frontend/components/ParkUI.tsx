import type { ComponentProps, ReactNode } from "react";
import { css, cx } from "styled-system/css";
import {
  badge as badgeRecipe,
  button as buttonRecipe,
  code as codeRecipe,
  field as fieldRecipe,
  input as inputRecipe,
  textarea as textareaRecipe,
  type BadgeVariantProps,
  type ButtonVariantProps,
  type CodeVariantProps,
  type InputVariantProps,
  type TextareaVariantProps,
} from "styled-system/recipes";

const fieldClasses = fieldRecipe();

const compactControl = css({
  borderRadius: "0",
  color: "text",
  fontFamily: "body",
  fontWeight: "normal",
  minW: 0,
  _focusVisible: {
    outlineColor: "mutedStrong",
    outlineOffset: "2px",
    outlineStyle: "solid",
    outlineWidth: "1px",
  },
});

const surfacedControl = css({
  bg: "control",
  borderColor: "lineStrong",
  _disabled: {
    bg: "surface",
    borderColor: "line",
    color: "muted",
  },
  _hover: { bg: "controlHover" },
});

const compactBadge = css({
  bg: "surfaceRaised",
  borderColor: "lineStrong",
  borderRadius: "0",
  color: "mutedStrong",
  display: "inline-flex",
  fontFamily: "body",
  fontWeight: "normal",
  w: "fit-content",
});

const compactCode = css({
  bg: "surfaceInset",
  borderColor: "line",
  borderRadius: "0",
  borderWidth: "1px",
  color: "text",
  fontFamily: "mono",
});

type ButtonProps = ComponentProps<"button"> & ButtonVariantProps;

export function Button({
  className,
  size = "sm",
  variant = "outline",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cx(
        buttonRecipe({ size, variant }),
        compactControl,
        variant !== "ghost" && surfacedControl,
        className,
      )}
      {...props}
    />
  );
}

export function IconButton(props: ButtonProps) {
  return <Button size="sm" variant="outline" {...props} />;
}

type InputProps = Omit<ComponentProps<"input">, "size"> & InputVariantProps;

export function Input({ className, size = "sm", ...props }: InputProps) {
  return (
    <input
      className={cx(
        inputRecipe({ size }),
        compactControl,
        surfacedControl,
        className,
      )}
      {...props}
    />
  );
}

type TextareaProps = ComponentProps<"textarea"> & TextareaVariantProps;

export function Textarea({ className, size = "md", ...props }: TextareaProps) {
  return (
    <textarea
      className={cx(
        textareaRecipe({ size }),
        compactControl,
        surfacedControl,
        className,
      )}
      {...props}
    />
  );
}

function FieldRoot({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx(fieldClasses.root, className)} {...props} />;
}

function FieldLabel({ className, ...props }: ComponentProps<"span">) {
  return <span className={cx(fieldClasses.label, className)} {...props} />;
}

export const Field = {
  Root: FieldRoot,
  Label: FieldLabel,
};

type BadgeProps = ComponentProps<"span"> & BadgeVariantProps;

export function Badge({
  className,
  size = "sm",
  variant = "outline",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cx(badgeRecipe({ size, variant }), compactBadge, className)}
      {...props}
    />
  );
}

type CodeProps = ComponentProps<"code"> &
  CodeVariantProps & {
    children: ReactNode;
  };

export function Code({
  className,
  size = "sm",
  variant = "ghost",
  ...props
}: CodeProps) {
  return (
    <code
      className={cx(codeRecipe({ size, variant }), compactCode, className)}
      {...props}
    />
  );
}
