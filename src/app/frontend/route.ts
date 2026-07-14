import { useEffect } from "react";

export type Page = { kind: "new" } | { kind: "session"; id: string };
const sessionPrefix = "/sessions/";
export function readPage(): Page {
  const { pathname } = globalThis.location;
  if (pathname === "/new") {
    return { kind: "new" };
  }
  if (pathname.startsWith(sessionPrefix)) {
    const id = decodeURIComponent(pathname.slice(sessionPrefix.length));
    if (id) {
      return { id, kind: "session" };
    }
  }
  return { kind: "new" };
}
export function pagePath(page: Page) {
  if (page.kind === "new") {
    return "/new";
  }
  return `/sessions/${encodeURIComponent(page.id)}`;
}
export function writePage(page: Page, replace = false) {
  const path = pagePath(page);
  if (globalThis.location.pathname === path) {
    return;
  }
  const method = replace ? "replaceState" : "pushState";
  globalThis.history[method](null, "", path);
}
export function sessionPage(id: string): Page {
  return { id, kind: "session" };
}
export function resolvePage(page: Page, sessions: { id: string }[], ready: boolean) {
  if (!ready) {
    return page;
  }
  if (page.kind === "new") {
    return page;
  }
  return sessions.some((session) => session.id === page.id) ? page : ({ kind: "new" } as const);
}
export function usePageNavigation(page: Page, currentPage: Page, setPage: (page: Page) => void) {
  useEffect(() => {
    const syncPage = () => {
      setPage(readPage());
    };
    globalThis.addEventListener("popstate", syncPage);
    return () => {
      globalThis.removeEventListener("popstate", syncPage);
    };
  }, [setPage]);
  useEffect(() => {
    if (samePage(page, currentPage)) {
      return;
    }
    writePage(currentPage, true);
  }, [currentPage, page]);
}
function samePage(left: Page, right: Page) {
  if (left.kind !== right.kind) {
    return false;
  }
  return left.kind !== "session" || right.kind !== "session" ? true : left.id === right.id;
}
