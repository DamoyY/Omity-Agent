export type Page =
  | { kind: "empty" }
  | { kind: "new" }
  | { kind: "session"; id: string };

const sessionPrefix = "/sessions/";

export function readPage(): Page {
  const { pathname } = window.location;
  if (pathname === "/new") return { kind: "new" };
  if (pathname.startsWith(sessionPrefix)) {
    const id = decodeURIComponent(pathname.slice(sessionPrefix.length));
    if (id) return { kind: "session", id };
  }
  return { kind: "empty" };
}

export function pagePath(page: Page) {
  if (page.kind === "new") return "/new";
  if (page.kind === "session") {
    return `/sessions/${encodeURIComponent(page.id)}`;
  }
  return "/";
}

export function writePage(page: Page, replace = false) {
  const path = pagePath(page);
  if (window.location.pathname === path) return;
  const method = replace ? "replaceState" : "pushState";
  window.history[method](null, "", path);
}
