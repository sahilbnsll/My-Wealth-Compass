/**
 * Cross-page action launcher.
 *
 * The command palette can trigger an action that lives inside a page (open the
 * "add holding" dialog, for example). When the target page is already mounted we
 * dispatch an event; when we have to navigate first we park the request in
 * sessionStorage and the page picks it up on mount.
 */
import { useEffect } from "react";

const KEY = "sfi.pendingAction";

export type LaunchAction =
  | "add-holding"
  | "add-sip"
  | "add-goal"
  | "add-transaction";

export type LaunchPayload = Record<string, unknown> | undefined;

type Parked = { action: LaunchAction; payload?: LaunchPayload };

export function queueAction(action: LaunchAction, payload?: LaunchPayload) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ action, payload } satisfies Parked));
  } catch {
    /* storage unavailable — the page simply opens without the shortcut */
  }
}

export function fireAction(action: LaunchAction, payload?: LaunchPayload) {
  window.dispatchEvent(new CustomEvent("sfi:action", { detail: { action, payload } }));
}

/** Run `handler` when the given action is requested from anywhere in the app. */
export function useLaunchAction(action: LaunchAction, handler: (payload: LaunchPayload) => void) {
  useEffect(() => {
    let parked: Parked | null = null;
    try {
      const raw = window.sessionStorage.getItem(KEY);
      if (raw) parked = JSON.parse(raw) as Parked;
    } catch {
      parked = null;
    }
    if (parked?.action === action) {
      try {
        window.sessionStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      handler(parked.payload);
    }

    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<Parked>).detail;
      if (detail?.action === action) handler(detail.payload);
    };
    window.addEventListener("sfi:action", onEvent);
    return () => window.removeEventListener("sfi:action", onEvent);
    // handler identity changes every render; the action key is the real dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);
}
