/**
 * A method that does nothing and answers with `createResult`, the way Chrome
 * would: extensions written against MV3 await a promise, while
 * `webextension-polyfill` and older code pass a callback as the last argument
 * and get `undefined` back. Both have to work, since an extension can use
 * either style for the same method.
 */
export function createNoopMethod(createResult: (callArguments: unknown[]) => unknown) {
  return (...callArguments: unknown[]) => {
    const result = createResult(callArguments);

    const callback = callArguments.at(-1);

    if (typeof callback === "function") {
      queueMicrotask(() => {
        (callback as (callbackResult: unknown) => void)(result);
      });

      return undefined;
    }

    return Promise.resolve(result);
  };
}

/**
 * A method answered elsewhere — over the bridge, typically — with the same
 * callback-or-promise duality as a noop. `produceResult` sees the call's
 * arguments without any trailing callback, and must resolve rather than throw:
 * a rejection would surface differently to the two calling styles.
 */
export function createBridgedMethod(produceResult: (callArguments: unknown[]) => Promise<unknown>) {
  return (...callArguments: unknown[]) => {
    const callback = callArguments.at(-1);

    if (typeof callback === "function") {
      void produceResult(callArguments.slice(0, -1)).then((result) => {
        (callback as (callbackResult: unknown) => void)(result);
      });

      return undefined;
    }

    return produceResult(callArguments);
  };
}
