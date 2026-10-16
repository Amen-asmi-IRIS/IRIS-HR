// jsdom has no matchMedia. This one answers "phone" or "desktop" on demand.
let phone = false;
const listeners = new Set<() => void>();

export function setPhoneViewport(value: boolean): void {
  phone = value;
  listeners.forEach((listener) => listener());
}

export function installViewport(): void {
  window.matchMedia = (query: string): MediaQueryList => {
    const isPhoneQuery = query.includes("max-width");
    return {
      get matches() {
        return isPhoneQuery ? phone : !phone;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => listeners.add(listener as () => void),
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => listeners.delete(listener as () => void),
      addListener: (listener: () => void) => listeners.add(listener),
      removeListener: (listener: () => void) => listeners.delete(listener),
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  };
}
