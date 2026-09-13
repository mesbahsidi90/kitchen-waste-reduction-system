type SerialPort = {
  readable: ReadableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
};

type SerialApi = {
  requestPort(): Promise<SerialPort>;
};

type SerialNavigator = Navigator & { serial?: SerialApi };

type ConnectOptions = {
  baudRate: number;
  onWeight(weightKg: number): void;
  onDisconnect(): void;
};

export type ScaleConnection = {
  disconnect(): Promise<void>;
};

export function isSerialSupported() {
  return "serial" in navigator;
}

export function parseScaleWeight(line: string): number | null {
  const match = line.match(/([+-]?\d+(?:[.,]\d+)?)\s*(kg|g)\b/i);
  if (!match) return null;

  const value = Number(match[1].replace(",", "."));
  if (!Number.isFinite(value) || value < 0) return null;
  return match[2].toLowerCase() === "g" ? value / 1_000 : value;
}

export async function connectToScale(options: ConnectOptions): Promise<ScaleConnection> {
  const serial = (navigator as SerialNavigator).serial;
  if (!serial) throw new Error("Web Serial is not supported");

  const port = await serial.requestPort();
  await port.open({ baudRate: options.baudRate });

  const reader = port.readable?.getReader();
  if (!reader) {
    await port.close();
    throw new Error("The scale has no readable serial stream");
  }

  let stopped = false;
  let buffer = "";
  const decoder = new TextDecoder();

  const readLoop = (async () => {
    try {
      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r\n|\n|\r/);
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const weight = parseScaleWeight(line);
          if (weight !== null) options.onWeight(Number(weight.toFixed(3)));
        }
      }
    } catch {
      // Disconnects are reported through the shared completion path below.
    } finally {
      reader.releaseLock();
      if (!stopped) options.onDisconnect();
    }
  })();

  return {
    async disconnect() {
      if (stopped) return;
      stopped = true;
      await reader.cancel().catch(() => undefined);
      await readLoop;
      await port.close().catch(() => undefined);
    },
  };
}
