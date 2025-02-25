import type { IpcRouter } from "@/lib/ipc";
import { createTRPCReact } from "@trpc/react-query";
import { ipcLink } from "electron-trpc/renderer";

export const trpc = createTRPCReact<IpcRouter>();

export const trpcClient = trpc.createClient({
	links: [ipcLink()],
});

export const TrpcProvider = trpc.Provider;
