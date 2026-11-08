import { EventEmitter } from 'node:events';

// TODO: in-process only, so live progress needs a single API instance (Redis pub/sub otherwise)
const bus = new EventEmitter().setMaxListeners(0);

export const publish = (scanId) => bus.emit(String(scanId));
export const subscribe = (scanId, fn) => {
  bus.on(String(scanId), fn);
  return () => bus.off(String(scanId), fn);
};
