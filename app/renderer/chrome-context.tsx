import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import type { Surface } from "../shared/channels/define.ts";
import type { RendererSurface } from "../shared/channels/surfaces.ts";
import type { Client } from "./client.ts";

/** A provider and a hook for a page's client, typed by the surface the page is on. */
export const defineClientContext = <S extends Surface>(page: string) => {
  const Context = createContext<Client<S> | undefined>(undefined);
  const Provider = ({
    client,
    children,
  }: {
    readonly client: Client<S>;
    readonly children: ReactNode;
  }) => <Context value={client}>{children}</Context>;
  const use = (): Client<S> => {
    const client = useContext(Context);
    if (client === undefined) {
      throw new Error(`A ${page} component needs its client provider above it`);
    }
    return client;
  };
  return { Provider, use };
};

const chrome = defineClientContext<RendererSurface>("chrome page");

/** Gives the chrome page's components its client. */
export const ChromeProvider = chrome.Provider;

export const useClient = chrome.use;
