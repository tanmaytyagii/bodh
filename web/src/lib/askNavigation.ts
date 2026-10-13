// The Ask page has two views at one address: the invitation, and the
// conversation (marked by #conversation, so refresh and back/forward keep it).
// Following a link to Ask while already on it brings back the invitation; the
// page cannot see that navigation, so the links handle it themselves and
// announce it with this event.

export const CONVERSATION_HASH = "#conversation";
export const SHOW_INVITATION = "sw:show-invitation";

/**
 * Called by links to the Ask page as they navigate. Elsewhere they navigate as
 * usual; on the Ask page itself they show its invitation instead, leaving the
 * conversation one step back in history.
 */
export function announceAskNavigation(event: { preventDefault(): void }): void {
  if (window.location.pathname !== "/") return;
  event.preventDefault();
  if (window.location.hash) window.history.pushState(null, "", "/");
  window.dispatchEvent(new Event(SHOW_INVITATION));
}
