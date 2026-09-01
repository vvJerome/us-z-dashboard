import "@testing-library/jest-dom";

// jsdom does not implement scrollIntoView, stub it so LogViewer doesn't crash in tests
window.HTMLElement.prototype.scrollIntoView = () => {};

// jsdom does not implement ResizeObserver, sonner's Toaster uses it to
// measure toast height and silently no-ops without it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// Node's experimental built-in `localStorage` global shadows jsdom's own
// (and is non-functional without `--localstorage-file`), so ThemeProvider's
// window.localStorage calls silently no-op in tests without this stub.
class LocalStorageStub implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}
Object.defineProperty(window, "localStorage", {
  value: new LocalStorageStub(),
  writable: true,
});

// jsdom does not implement matchMedia, ThemeProvider uses it to detect the
// OS color scheme preference on first load.
window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
