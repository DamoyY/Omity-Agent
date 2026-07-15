import { Button, Code, LinkButton } from "../ParkUI";
import { KeyRound, ShieldCheck } from "lucide-react";
import type { AccessStatus } from "../../services/access";
import { css } from "styled-system/css";
import { useTranslation } from "react-i18next";

const page = css({
  alignItems: "center",
  bg: "canvas",
  color: "text",
  display: "grid",
  fontFamily: "body",
  minH: "100vh",
  p: "6",
});
const card = css({
  bg: "surface",
  borderColor: "lineStrong",
  borderWidth: "1px",
  display: "grid",
  gap: "5",
  maxW: "32rem",
  mx: "auto",
  p: "8",
  w: "full",
});
const icon = css({ color: "mutedStrong" });
const heading = css({ fontSize: "xl", fontWeight: "medium", m: 0 });
const description = css({ color: "mutedStrong", lineHeight: "1.7", m: 0 });
const errorText = css({ color: "statusError", fontSize: "sm", m: 0 });
const actions = css({ display: "flex", flexWrap: "wrap", gap: "3" });
interface AccessPageProps {
  busy: boolean;
  error?: string;
  status?: AccessStatus;
  ticketUrl?: string;
  onLogin: () => void;
  onRegister: () => void;
  onTicket: () => void;
  onContinue: () => void;
  setup: boolean;
}
export function AccessPage(props: AccessPageProps) {
  const { t } = useTranslation();
  const { busy, error, status, ticketUrl, onContinue, onLogin, onRegister, onTicket, setup } =
    props;
  const localSetup =
    setup &&
    status?.local === true &&
    globalThis.location.origin !== status.publicOrigin &&
    [null, "manage"].includes(new URLSearchParams(globalThis.location.search).get("setup"));
  const setupLink = ticketUrl ?? status?.publicOrigin;
  return (
    <main className={page}>
      <section className={card}>
        {setup ? (
          <ShieldCheck className={icon} size={28} />
        ) : (
          <KeyRound className={icon} size={28} />
        )}
        <h1 className={heading}>{t(setup ? "accessSetupTitle" : "accessLoginTitle")}</h1>
        <p className={description}>
          {t(setup ? "accessSetupDescription" : "accessLoginDescription")}
        </p>
        {status && !status.configured && <p className={errorText}>{t("accessNotConfigured")}</p>}
        {ticketUrl && (
          <p className={description}>
            {t("accessSetupLink")} <Code>{ticketUrl}</Code>
          </p>
        )}
        {error && <p className={errorText}>{error}</p>}
        <div className={actions}>
          {setup ? (
            <>
              {localSetup && (
                <Button disabled={busy || !status.configured} onClick={onTicket} type="button">
                  {t("accessCreateSetupLink")}
                </Button>
              )}
              {localSetup && setupLink && (
                <LinkButton href={setupLink}>
                  {t(ticketUrl ? "accessOpenSetupLink" : "accessOpenPublicOrigin")}
                </LinkButton>
              )}
              {!localSetup && (
                <Button disabled={busy} onClick={onRegister} type="button">
                  {t("accessRegister")}
                </Button>
              )}
              {localSetup && (
                <Button disabled={busy} onClick={onContinue} type="button" variant="ghost">
                  {t("accessContinueLocal")}
                </Button>
              )}
            </>
          ) : (
            <Button disabled={busy || !status?.configured} onClick={onLogin} type="button">
              {t("accessVerify")}
            </Button>
          )}
        </div>
      </section>
    </main>
  );
}
