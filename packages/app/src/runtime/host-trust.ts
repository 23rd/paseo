import type { ConnectionOffer } from "@getpaseo/protocol/connection-offer";

/**
 * A pairing offer (from a URL, a QR code, or a pasted link) names the daemon the
 * client will connect to. Before a new host is added, or a saved host's
 * connection changes, the user confirms the host. A link that matches a saved
 * host exactly connects without asking.
 *
 * The host runtime (the model) owns the decision to ask; the UI registers a
 * confirmer that renders the prompt. When no confirmer is registered the answer
 * is "no", so a pairing link never connects without confirmation.
 */
export interface HostTrustRequest {
  /** Stable daemon identifier carried by the offer. */
  serverId: string;
  /** Human-comparable fingerprint of the daemon's public key. */
  keyFingerprint: string;
  /** Relay endpoint the client would connect through. */
  endpoint: string;
  /** A host with this server id is saved, and the link changes its connection. */
  isKnown: boolean;
}

export type HostTrustConfirmer = (request: HostTrustRequest) => Promise<boolean>;

/** Thrown when the user cancels the trust prompt. Callers treat it as a no-op. */
export class HostTrustDeclinedError extends Error {
  constructor(serverId: string) {
    super(`Connection to ${serverId} was not approved`);
    this.name = "HostTrustDeclinedError";
  }
}

export function isHostTrustDeclinedError(error: unknown): error is HostTrustDeclinedError {
  return error instanceof HostTrustDeclinedError;
}

/**
 * The approval given during one pairing flow (one QR scan, or one open pairing
 * modal). When the approved host then asks for a password, the retry passes the
 * same `OfferApproval` so the user is not asked twice. It only covers the exact
 * offer that was approved, and a new flow starts with a new one.
 */
export class OfferApproval {
  private approved: ConnectionOffer | null = null;

  record(offer: ConnectionOffer): void {
    this.approved = offer;
  }

  covers(offer: ConnectionOffer): boolean {
    const approved = this.approved;
    return (
      approved !== null &&
      approved.serverId === offer.serverId &&
      approved.daemonPublicKeyB64 === offer.daemonPublicKeyB64 &&
      approved.relay.endpoint === offer.relay.endpoint &&
      approved.relay.useTls === offer.relay.useTls
    );
  }
}

let activeConfirmer: HostTrustConfirmer | null = null;

/**
 * Register the UI that answers trust prompts. Passing `null` unregisters it,
 * which returns the module to declining every request.
 */
export function setHostTrustConfirmer(confirmer: HostTrustConfirmer | null): void {
  activeConfirmer = confirmer;
}

/**
 * Ask whether the user trusts this host. Returns `false` when no confirmer is
 * registered so an offer link can never add or connect a host without consent.
 */
export async function confirmHostTrust(request: HostTrustRequest): Promise<boolean> {
  if (!activeConfirmer) return false;
  return activeConfirmer(request);
}

/**
 * Render a daemon public key as a grouped fingerprint the user can compare
 * against the key shown by their daemon. This shows the key material itself
 * (not a re-hash), so different keys show different values.
 */
export function formatDaemonKeyFingerprint(daemonPublicKeyB64: string): string {
  const normalized = daemonPublicKeyB64.replace(/[^A-Za-z0-9]/g, "");
  if (normalized.length <= 16) {
    return normalized.replace(/(.{4})/g, "$1 ").trim();
  }
  const head = normalized.slice(0, 8);
  const tail = normalized.slice(-8);
  const group = (value: string): string => value.replace(/(.{4})/g, "$1 ").trim();
  return `${group(head)} … ${group(tail)}`;
}

export function hostTrustRequestFromOffer(
  offer: ConnectionOffer,
  options: { isKnown: boolean },
): HostTrustRequest {
  return {
    serverId: offer.serverId,
    keyFingerprint: formatDaemonKeyFingerprint(offer.daemonPublicKeyB64),
    endpoint: offer.relay.endpoint,
    isKnown: options.isKnown,
  };
}
