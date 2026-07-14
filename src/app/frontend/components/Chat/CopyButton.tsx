import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { css, cx } from "styled-system/css";
import { reportPromiseErrors } from "../../services/errors";
import { IconButton } from "../ParkUI";

const button = css({
  borderWidth: "0",
  flexShrink: 0,
});

const copiedDurationMs = 1600;

export function CopyButton({ className, value }: { className?: string; value: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      setCopied(false);
    }, copiedDurationMs);
  };

  const label = t(copied ? "copied" : "copy");
  return (
    <IconButton
      aria-label={label}
      className={cx(button, className)}
      disabled={!value}
      onClick={() => {
        reportPromiseErrors(copy());
      }}
      title={label}
      type="button"
      variant="ghost"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </IconButton>
  );
}
