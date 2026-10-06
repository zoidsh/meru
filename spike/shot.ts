/** SPIKE helper. Captures a CDP target's page as a PNG. */
const [portArg, urlNeedle, outPath] = Bun.argv.slice(2);

const port = Number(portArg);

type Target = { type: string; url: string; webSocketDebuggerUrl: string };

const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as Target[];
const target = targets.find((candidate) => candidate.url.includes(urlNeedle ?? ""));

if (!target) {
  console.error(targets.map((candidate) => `${candidate.type} ${candidate.url}`).join("\n"));
  process.exit(1);
}

const socket = new WebSocket(target.webSocketDebuggerUrl);

let nextId = 1;
const pending = new Map<number, (value: unknown) => void>();

function send(method: string, params: Record<string, unknown> = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise<any>((resolve) => pending.set(id, resolve));
}

socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)?.(message.result ?? message.error);
    pending.delete(message.id);
  }
});

await new Promise((resolve) => socket.addEventListener("open", resolve));

await send("Page.enable");

const result = await send("Page.captureScreenshot", { format: "png" });

await Bun.write(outPath as string, Buffer.from(result.data, "base64"));

console.log("wrote", outPath);

socket.close();
process.exit(0);
