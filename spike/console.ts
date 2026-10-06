/** SPIKE helper. Streams console output of a CDP target for a while. */
const [portArg, urlNeedle, ...rest] = Bun.argv.slice(2);

const port = Number(portArg);
const waitIndex = rest.indexOf("--wait");
const waitMs = waitIndex === -1 ? 10000 : Number(rest[waitIndex + 1]);
const shouldReload = rest.includes("--reload");

type Target = { type: string; url: string; webSocketDebuggerUrl: string };

const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as Target[];
const target = targets.find((candidate) => candidate.url.includes(urlNeedle ?? ""));

if (!target) {
  console.error(targets.map((candidate) => `${candidate.type} ${candidate.url}`).join("\n"));
  process.exit(1);
}

const socket = new WebSocket(target.webSocketDebuggerUrl);

let nextId = 1;

function send(method: string, params: Record<string, unknown> = {}) {
  socket.send(JSON.stringify({ id: nextId++, method, params }));
}

socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));

  if (message.method === "Runtime.consoleAPICalled") {
    const text = message.params.args
      .map((argument: any) => argument.value ?? argument.description ?? argument.type)
      .join(" ");
    console.log(`[${message.params.type}]`, String(text).slice(0, 400));
  }

  if (message.method === "Runtime.exceptionThrown") {
    console.log(
      "[exception]",
      String(message.params.exceptionDetails.exception?.description ?? "").slice(0, 400),
    );
  }

  if (message.method === "Log.entryAdded") {
    console.log(
      `[log:${message.params.entry.level}]`,
      String(message.params.entry.text).slice(0, 400),
    );
  }
});

await new Promise((resolve) => socket.addEventListener("open", resolve));

send("Runtime.enable");
send("Log.enable");

if (shouldReload) {
  send("Page.enable");
  send("Page.reload");
}

await new Promise((resolve) => setTimeout(resolve, waitMs));
socket.close();
process.exit(0);
