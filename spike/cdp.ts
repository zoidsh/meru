/**
 * SPIKE helper. Evaluates JS in a CDP target, optionally in an isolated world
 * named after an extension, and prints the result.
 *
 *   bun spike/cdp.ts <port> <urlSubstring> [--world <name>] [--reload] <<'JS'
 *   ...expression...
 *   JS
 */
const [portArg, urlNeedle, ...rest] = Bun.argv.slice(2);

const port = Number(portArg);

const worldIndex = rest.indexOf("--world");
const world = worldIndex === -1 ? undefined : rest[worldIndex + 1];
const shouldReload = rest.includes("--reload");
const waitIndex = rest.indexOf("--wait");
const waitMs = waitIndex === -1 ? 1500 : Number(rest[waitIndex + 1]);

const expression = await Bun.stdin.text();

type Target = { type: string; url: string; title: string; webSocketDebuggerUrl: string };

const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as Target[];

const target = targets.find((candidate) => candidate.url.includes(urlNeedle ?? ""));

if (!target) {
  console.error("No target matching", urlNeedle);
  console.error(targets.map((candidate) => `${candidate.type} ${candidate.url}`).join("\n"));
  process.exit(1);
}

const socket = new WebSocket(target.webSocketDebuggerUrl);

let nextId = 1;
const pending = new Map<number, (value: unknown) => void>();
const contexts: { id: number; name: string; origin: string; auxData: unknown }[] = [];

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
    contexts.push(message.params.context);
  }
  if (message.method === "Runtime.executionContextDestroyed") {
    const index = contexts.findIndex((context) => context.id === message.params.executionContextId);
    if (index !== -1) {
      contexts.splice(index, 1);
    }
  }
});

await new Promise((resolve) => socket.addEventListener("open", resolve));

await send("Runtime.enable");

if (shouldReload) {
  await send("Page.enable");
  await send("Page.reload");
}

await new Promise((resolve) => setTimeout(resolve, waitMs));

let uniqueContextId: string | undefined;

if (world) {
  const frameIndex = rest.indexOf("--frame");
  const frameNeedle = frameIndex === -1 ? undefined : rest[frameIndex + 1];

  const matches = contexts.filter(
    (context) =>
      context.name.includes(world) &&
      (!frameNeedle || String((context.auxData as any)?.frameId).includes(frameNeedle)),
  );

  const match = matches[matches.length - 1];

  if (!match) {
    console.error(
      "No isolated world matching",
      world,
      "\n",
      contexts.map((context) => `${context.id} "${context.name}" ${context.origin}`).join("\n"),
    );
    process.exit(1);
  }

  uniqueContextId = (match as any).uniqueId;
}

const result = await send("Runtime.evaluate", {
  expression,
  awaitPromise: true,
  returnByValue: true,
  ...(uniqueContextId === undefined ? {} : { uniqueContextId }),
});

console.log(JSON.stringify(result, null, 2));

socket.close();
process.exit(0);
