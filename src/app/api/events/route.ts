import { requirePermission } from "@/lib/api-guard";
import { subscribeToTenantEvents, type RealtimeEvent } from "@/server/realtime";

// SSE needs a long-lived Node connection (pg LISTEN), so this route is Node runtime
// and never statically cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/events — Server-Sent Events stream of the caller's tenant events
 * (relocated from /api/v1 in the M0 cull). The notification bell listens here;
 * clients invalidate caches on the events they care about.
 */
export async function GET(req: Request) {
  const guard = await requirePermission("dashboard:read");
  if ("response" in guard) return guard.response;
  const { tenantId } = guard.ctx;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk));

      // Initial comment opens the stream; retry hint tells EventSource how to reconnect.
      send(": connected\n\nretry: 3000\n\n");

      const unsubscribe = await subscribeToTenantEvents(tenantId, (event: RealtimeEvent) => {
        send(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      });

      // Heartbeat keeps intermediaries from closing an idle connection.
      const heartbeat = setInterval(() => send(": ping\n\n"), 25_000);

      const close = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
