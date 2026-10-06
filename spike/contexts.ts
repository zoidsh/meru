/** SPIKE helper. Lists execution contexts of a CDP target after an optional reload. */
const [portArg, urlNeedle, ...rest] = Bun.argv.slice(2);

const port = Number(portArg);
const shouldReload = rest.includes("--reload");
const waitIndex = rest.indexOf("--wait");
const waitMs = waitIndex === -1 ? 3000 : Number(rest[waitIndex + 1]);

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
    return;
  }
  if (message.method === "Runtime.executionContextCreated") {
    const { id, name, origin, auxData } = message.params.context;
    console.log("created", id, JSON.stringify({ name, origin, auxData }));
  }
  if (message.method === "Runtime.executionContextDestroyed") {
    console.log("destroyed", message.params.executionContextId);
  }
});

await new Promise((resolve) => socket.addEventListener("open", resolve));
await send("Runtime.enable");

if (shouldReload) {
  await send("Page.enable");
  await send("Page.reload");
}

await new Promise((resolve) => setTimeout(resolve, waitMs));
socket.close();
process.exit(0);
