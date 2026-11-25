/**
 * A minimal server-sent-events reader for fetch streams (the browser's EventSource can't
 * send a POST body). Feed it decoded text in any chunking; it calls back once per complete
 * event with its name and parsed JSON data. Comments (": keep-alive") are ignored, and an
 * event whose data isn't JSON is passed as { raw }.
 */
export interface SseEvent {
  id: string | null;
  event: string;
  data: unknown;
}

export function createSseParser(onEvent: (e: SseEvent) => void): { push: (chunk: string) => void; end: () => void } {
  let buffer = "";
  const flush = (block: string) => {
    let id: string | null = null;
    let event = "message";
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (!line || line.startsWith(":")) continue;
      const i = line.indexOf(":");
      const field = i === -1 ? line : line.slice(0, i);
      const value = i === -1 ? "" : line.slice(i + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
      else if (field === "id") id = value;
    }
    if (!data.length) return;
    const text = data.join("\n");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
    onEvent({ id, event, data: parsed });
  };
  return {
    push(chunk) {
      buffer += chunk;
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      for (const b of blocks) flush(b);
    },
    end() {
      if (buffer.trim()) flush(buffer);
      buffer = "";
    },
  };
}
