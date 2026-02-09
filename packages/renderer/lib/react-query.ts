import { ipc } from "@meru/renderer-lib/ipc";
import type { Config } from "@meru/shared/types";
import {
	QueryClient,
	queryOptions,
	useMutation,
	useQuery,
} from "@tanstack/react-query";

export const queryClient = new QueryClient();

ipc.renderer.on("config.configChanged", (_event, config) => {
	queryClient.setQueryData(["config"], config);
});

export const configQueryOptions = queryOptions({
	queryKey: ["config"],
	queryFn: () => ipc.main.invoke("config.getConfig"),
	staleTime: Number.POSITIVE_INFINITY,
});

export function useConfig() {
	const { data } = useQuery(configQueryOptions);

	return {
		config: data,
	};
}

export function getConfig() {
	return queryClient.fetchQuery(configQueryOptions);
}

export function useConfigMutation({
	onSuccess,
}: {
	onSuccess?: () => void;
} = {}) {
	return useMutation({
		mutationFn: (config: Partial<Config>) =>
			ipc.main.invoke("config.setConfig", config),
		onSuccess,
	});
}
