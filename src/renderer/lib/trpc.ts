import { ipcLink } from "electron-trpc/renderer";
import { createTRPCReact } from "@trpc/react-query";
import type { IpcRouter } from "@/lib/ipc";

export const trpc = createTRPCReact<IpcRouter>();

export const trpcClient = trpc.createClient({
	links: [ipcLink()],
});

export const TrpcProvider = trpc.Provider;
