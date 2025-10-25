import { ipc } from "@meru/renderer-lib/ipc";
import type { Config } from "@meru/shared/types";
import { QueryClient, useMutation, useQuery } from "@tanstack/react-query";

export const queryClient = new QueryClient();

ipc.renderer.on("config.configChanged", (_event, config) => {
	queryClient.setQueryData(["config"], config);
});

export function useConfig() {
	const { data } = useQuery({
		queryKey: ["config"],
		queryFn: () => ipc.main.invoke("config.getConfig"),
		staleTime: Number.POSITIVE_INFINITY,
	});

	return {
		config: data,
	};
}

export function useConfigMutation() {
	return useMutation({
		mutationFn: (config: Partial<Config>) =>
			ipc.main.invoke("config.setConfig", config),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["config"] });
		},
	});
}
