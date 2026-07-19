import {
  type AccessStatus,
  accessStatus,
  login,
  logout,
  register,
  registrationTicket,
} from "../../services/access";
import { IconButton, LinkButton } from "../ParkUI";
import { KeyRound, LogOut } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { AccessPage } from "./AccessPage";
import { css } from "styled-system/css";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

const accessButton = css({
  h: "8",
  position: "fixed",
  right: "3",
  top: "3",
  w: "8",
  zIndex: "overlay",
});
export function AccessGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AccessStatus>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string>();
  const [continueLocal, setContinueLocal] = useState(false);
  const [ticketUrl, setTicketUrl] = useState<string>();
  const setupValue = new URLSearchParams(globalThis.location.search).get("setup") ?? undefined;
  const setupTicket = setupValue === "manage" ? undefined : setupValue;
  const publicOrigin = status?.publicOrigin;
  const load = useCallback(async () => {
    const next = await accessStatus();
    setStatus(next);
  }, []);
  useEffect(() => {
    void run(setBusy, setError, load);
  }, [load]);
  useEffect(() => {
    const refresh = () => {
      setStatus(undefined);
      void run(setBusy, setError, load);
    };
    globalThis.addEventListener("omity:auth-required", refresh);
    return () => {
      globalThis.removeEventListener("omity:auth-required", refresh);
    };
  }, [load]);
  const authenticate = useCallback(
    () =>
      run(setBusy, setError, async () => {
        const result = await login();
        if (result.authenticated) {
          await load();
        }
      }),
    [load],
  );
  const enroll = useCallback(
    () =>
      run(setBusy, setError, async () => {
        await register(setupTicket);
        globalThis.history.replaceState(null, "", "./#/new");
        await load();
      }),
    [load, setupTicket],
  );
  const createTicket = useCallback(
    () =>
      run(setBusy, setError, async () => {
        const result = await registrationTicket();
        if (!publicOrigin) {
          throw new Error("公网 Origin 尚未配置");
        }
        const url = new URL(globalThis.location.pathname, publicOrigin);
        url.searchParams.set("setup", result.ticket);
        setTicketUrl(url.href);
      }),
    [publicOrigin],
  );
  const continueWithoutSetup = useCallback(() => {
    setContinueLocal(true);
  }, []);
  const endSession = useCallback(
    () =>
      run(setBusy, setError, async () => {
        await logout();
        queryClient.clear();
        setStatus(await accessStatus());
      }),
    [queryClient],
  );
  const setup =
    setupValue !== undefined || (status?.local === true && status.credentialCount === 0);
  if (status?.authenticated && (!setup || continueLocal)) {
    return (
      <>
        {children}
        {!status.local && (
          <IconButton
            aria-label={t("accessLogout")}
            className={accessButton}
            disabled={busy}
            onClick={endSession}
            title={t("accessLogout")}
            type="button"
          >
            <LogOut size={14} />
          </IconButton>
        )}
        {status.local && status.configured && (
          <LinkButton
            aria-label={t("accessManageCredentials")}
            className={accessButton}
            href="?setup=manage#/new"
            title={t("accessManageCredentials")}
          >
            <KeyRound size={14} />
          </LinkButton>
        )}
      </>
    );
  }
  return (
    <AccessPage
      busy={busy}
      error={error}
      status={status}
      ticketUrl={ticketUrl}
      setup={setup}
      onContinue={continueWithoutSetup}
      onLogin={authenticate}
      onRegister={enroll}
      onTicket={createTicket}
    />
  );
}
async function run(
  setBusy: (value: boolean) => void,
  setError: (value?: string) => void,
  action: () => Promise<unknown>,
) {
  setBusy(true);
  setError(undefined);
  try {
    await action();
  } catch (error: unknown) {
    setError(error instanceof Error ? error.message : String(error));
  } finally {
    setBusy(false);
  }
}
