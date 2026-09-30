#!/usr/bin/env node
const net = require('net');

const TARGET_HOST = process.env.PROXY_TARGET_HOST || '127.0.0.1';
const BINDS = (process.env.PROXY_BIND || '172.17.0.1,0.0.0.0')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

const PAIRS = (process.env.PROXY_MAP || '11435:11434,20129:20128')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)
  .map(entry => {
    const [listen, target] = entry.split(':').map(Number);
    if (!Number.isInteger(listen) || !Number.isInteger(target)) {
      console.error(`[llm-proxy] invalid PROXY_MAP entry "${entry}" (want listen:target)`);
      process.exit(1);
    }
    return { listen, target };
  });

function bridge(client, targetPort) {
  const upstream = net.connect({ host: TARGET_HOST, port: targetPort });
  const teardown = cause => {
    client.destroy();
    upstream.destroy();
    if (cause && process.env.PROXY_VERBOSE === 'true') console.log(`[llm-proxy] closed (${cause})`);
  };

  upstream.once('connect', () => {
    client.pipe(upstream);
    upstream.pipe(client);
  });
  upstream.once('error', error => teardown(`upstream ${error.code || error.message}`));
  client.once('error', error => teardown(`client ${error.code || error.message}`));
  upstream.once('close', () => teardown('upstream closed'));
  client.once('close', () => teardown('client closed'));
}

function serve({ listen, target }) {
  let index = 0;

  const attempt = () => {
    const host = BINDS[index++];
    if (!host) {
      console.error(`[llm-proxy] could not bind :${listen} on [${BINDS.join(', ')}] — giving up`);
      process.exitCode = 1;
      return;
    }

    const server = net.createServer(socket => bridge(socket, target));
    const bindFailure = error => {
      console.warn(`[llm-proxy] bind ${host}:${listen} failed (${error.code || error.message}) — trying next address`);
      attempt();
    };

    server.once('error', bindFailure);
    server.listen(listen, host, () => {
      server.removeListener('error', bindFailure);
      server.on('error', error => console.error(`[llm-proxy] server :${listen} error: ${error.message}`));
      console.log(`[llm-proxy] ${host}:${listen} -> ${TARGET_HOST}:${target}`);
    });
  };

  attempt();
}

console.log(`[llm-proxy] starting: ${PAIRS.map(p => `:${p.listen}->${TARGET_HOST}:${p.target}`).join(' ')} (bind ${BINDS.join(', ')})`);
PAIRS.forEach(serve);

const shutdown = signal => {
  console.log(`[llm-proxy] ${signal} — exiting`);
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
