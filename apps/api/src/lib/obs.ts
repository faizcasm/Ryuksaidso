import {
  appendObsLog,
  appendObsRequest,
  type ObsLogEntry,
  type ObsRequestEntry,
} from '@ryuksaidso/agent-tools';
import { redis } from './redis';
import Transport from 'winston-transport';

export function captureRequest(entry: ObsRequestEntry) {
  void appendObsRequest(redis as any, entry);
}

export function captureLog(entry: ObsLogEntry) {
  void appendObsLog(redis as any, entry);
}

export class ObsRingTransport extends Transport {
  log(info: any, callback: () => void) {
    const level = String(info?.level ?? '');
    if (level === 'warn' || level === 'error' || level === 'fatal') {
      const { level: _level, message, timestamp: _ts, service, ...rest } = info ?? {};
      captureLog({
        t: Date.now(),
        level,
        message: String(message ?? ''),
        meta: { ...(rest && typeof rest === 'object' ? rest : {}), ...(service ? { service } : {}) },
      });
    }
    callback();
  }
}
