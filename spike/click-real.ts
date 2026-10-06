/** SPIKE helper. Dispatches a real trusted mouse click at page coordinates. */
const [portArg, urlNeedle, xArg, yArg] = Bun.argv.slice(2);

const port = Number(portArg);
const x = Number(xArg);
const y = Number(yArg);

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

const base = { x, y, button: "left", clickCount: 1, buttons: 1 };

await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
await send("Input.dispatchMouseEvent", { ...base, type: "mousePressed" });
await send("Input.dispatchMouseEvent", { ...base, type: "mouseReleased", buttons: 0 });

console.log("clicked", x, y);

await new Promise((resolve) => setTimeout(resolve, 3000));
socket.close();
process.exit(0);
