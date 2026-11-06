import { EventEmitter } from 'node:events';

// shortcut: in-process only, so SSE clients must hit the same API instance that runs the scan; use Redis pub/sub if the API ever scales to more than one instance
const bus = new EventEmitter().setMaxListeners(0);

export const publish = (scanId) => bus.emit(String(scanId));
export const subscribe = (scanId, fn) => {
  bus.on(String(scanId), fn);
  return () => bus.off(String(scanId), fn);
};
