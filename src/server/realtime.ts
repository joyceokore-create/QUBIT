import "server-only";
import type { Prisma } from "@prisma/client";
import { Client } from "pg";

/**
 * Realtime via Postgres LISTEN/NOTIFY (docs/clickup-transformation/02-architecture.md).
 * Mutations emit an event on the `qubit_events` channel inside their tenant
 * transaction; the SSE route (`/api/v1/events`) subscribes and fans out to
 * connected clients, filtered by tenant. Never poll — automations/UI react to events.
 */

export const EVENTS_CHANNEL = "qubit_events";

export interface RealtimeEvent {
  tenantId: string;
  type: string; // e.g. "task.updated", "space.created"
  objectType?: string;
  objectId?: string;
  actorId?: string | null;
  data?: Record<string, unknown>;
}

/**
 * Emit an event. Call inside `forTenant()` so it commits atomically with the
 * mutation — a rolled-back transaction emits nothing. pg_notify payloads are
 * capped at 8000 bytes, so we send identifiers only (never user content).
 */
export async function emitEvent(tx: Prisma.TransactionClient, event: RealtimeEvent): Promise<void> {
  const payload = JSON.stringify(event);
  await tx.$executeRaw`SELECT pg_notify(${EVENTS_CHANNEL}, ${payload})`;
}

// ── Shared LISTEN connection with in-process fan-out ────────────────────────

type Subscriber = (event: RealtimeEvent) => void;

interface ListenerState {
  client: Client;
  subscribers: Set<Subscriber>;
  ready: Promise<void>;
}

// Cache the LISTEN client on globalThis so dev HMR doesn't open a new connection
// on every reload.
const globalForListen = globalThis as unknown as { __qubitListener?: ListenerState };

function getListener(): ListenerState {
  if (globalForListen.__qubitListener) return globalForListen.__qubitListener;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  const subscribers = new Set<Subscriber>();

  const ready = client
    .connect()
    .then(() => client.query(`LISTEN ${EVENTS_CHANNEL}`))
    .then(() => {
      client.on("notification", (msg) => {
        if (!msg.payload) return;
        let event: RealtimeEvent;
        try {
          event = JSON.parse(msg.payload) as RealtimeEvent;
        } catch {
          return; // ignore malformed payloads
        }
        for (const sub of subscribers) sub(event);
      });
    });

  const state: ListenerState = { client, subscribers, ready };
  globalForListen.__qubitListener = state;
  return state;
}

/**
 * Subscribe to realtime events for one tenant. Returns an unsubscribe function.
 * The SSE route uses this to stream a client's own tenant's events only.
 */
export async function subscribeToTenantEvents(
  tenantId: string,
  onEvent: Subscriber,
): Promise<() => void> {
  const state = getListener();
  await state.ready;
  const filtered: Subscriber = (event) => {
    if (event.tenantId === tenantId) onEvent(event);
  };
  state.subscribers.add(filtered);
  return () => state.subscribers.delete(filtered);
}
