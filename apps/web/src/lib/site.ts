export const SITE_NAME = 'RYUKSAIDSO';
export const FOUNDER = 'Faizan Hameed';
export const FOUNDER_HANDLE = 'Faizcasm';
export const FOUNDER_URL = 'https://faizcasm.me';
export const SITE_TAGLINE = 'Agent reliability & control plane';
export const SITE_DESCRIPTION =
  'RYUKSAIDSO is the agent reliability and control plane: plan, trace, approve, evaluate and roll back production AI agent runs — policy gates, durable traces and multi-provider failover in one platform.';

const envUrl = process.env.NEXT_PUBLIC_APP_URL;
export const SITE_URL =
  envUrl && envUrl.startsWith('http') ? envUrl.replace(/\/$/, '') : 'https://ryuksaidso.faizcasm.me';
