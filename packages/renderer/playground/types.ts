import type { ExtractArgs, ExtractHandler } from "@electron-toolkit/typed-ipc/renderer";
import type { Config, IpcMainEvents, IpcRendererEvent } from "@meru/shared/types";
import type { PlaygroundComponentId } from "./components";

/** Every channel the renderer can reach the main process on, either way. */
export type IpcCallChannel = keyof ExtractArgs<IpcMainEvents> | keyof ExtractHandler<IpcMainEvents>;

/**
 * One call the renderer made, which is as far as it gets here: a send has
 * nowhere to arrive, so the playground records it and shows it instead.
 */
export type IpcCall = {
  kind: "send" | "invoke";
  channel: IpcCallChannel;
  args: unknown[];
  /** Set on an invoke no scenario answers, which resolves with `undefined`. */
  unanswered: boolean;
};

/**
 * What each invoke channel answers with, so that a scenario can fixture any of
 * them by name and have the reply checked against the real return type.
 */
export type IpcInvokeReplies = {
  [Channel in keyof ExtractHandler<IpcMainEvents>]?: ReturnType<
    ExtractHandler<IpcMainEvents>[Channel]
  >;
};

/**
 * One event to push, held as its channel and arguments rather than as a call.
 * This is what keeps a scenario plain data: a runner could read the list out of
 * a JSON file and drive the same components without the playground around them.
 */
export type ScenarioEvent = {
  [Channel in keyof IpcRendererEvent]: {
    channel: Channel;
    args: IpcRendererEvent[Channel];
  };
}[keyof IpcRendererEvent];

/**
 * A state to render a component in. Everything here is data, for the reason
 * given on `ScenarioEvent`.
 */
export type Scenario = {
  id: string;
  /** Names the state rather than the component: "Files moved or deleted". */
  name: string;
  description: string;
  component: PlaygroundComponentId;
  /** Merged over the app's real default config before anything reads it. */
  config?: Partial<Config>;
  /** Replies for invoke channels other than the config, which comes from `config`. */
  invoke?: IpcInvokeReplies;
  /** Pushed in order once the component has mounted. */
  events?: ScenarioEvent[];
};
