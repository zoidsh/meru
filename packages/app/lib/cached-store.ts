import Store from "electron-store";

// conf reads and parses the file on every access to `store`, which every `get`,
// `set` and change listener goes through. Upstream conf has a `cache` option
// on `main` but in no release yet; once one ships it, this class reduces to
// `cache: true` and the cloning reads, since upstream returns cached objects.
// Edits made to the file while the app runs are ignored, then overwritten by
// the next write.
export class CachedStore<T extends Record<string, any>> extends Store<T> {
  // Not a class field: conf reads and writes `store` inside its constructor,
  // before a subclass field would be initialised, and the initialiser would
  // then wipe what the migrations cached.
  declare private cached: T | undefined;

  private get snapshot(): T {
    this.cached ??= super.store;
    return this.cached;
  }

  // Reads are deep copies, because callers mutate what they read: conf's `set`
  // the store before writing it back, `repairAccountConfigs` the accounts. A
  // mutated cache would also make conf's change detection compare a value with
  // itself. Null prototype as conf has it, so `key in store` only sees keys in
  // the file.
  override get store(): T {
    return Object.assign(Object.create(null), structuredClone(this.snapshot));
  }

  // Cached through JSON so it holds what the file does, without `undefined`
  // properties and the like that would make the next comparison differ. Cached
  // before writing, because conf dispatches the change event from within the
  // write and its listeners read `store` again.
  override set store(value: T) {
    const previous = this.cached;
    this.cached = Object.assign(Object.create(null), JSON.parse(JSON.stringify(value)));

    try {
      super.store = value;
    } catch (error) {
      this.cached = previous;
      throw error;
    }
  }

  // Copies the one value rather than the whole store. Dot-notation keys are
  // not looked up, as `config.ts` turns them off.
  override get<Key extends keyof T>(key: Key): T[Key] {
    return structuredClone(this.snapshot[key]);
  }
}
