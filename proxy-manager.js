import { HttpsProxyAgent } from 'https-proxy-agent';
import { getProxyConfigs } from './config.js';
import { logInfo, logError, logDebug } from './logger.js';

let proxyIndex = 0;
let lastSnapshot = '';

function snapshotConfigs(configs) {
  try {
    return JSON.stringify(configs);
  } catch (error) {
    logDebug('Failed to snapshot proxy configs', { error: error.message });
    return '';
  }
}

export function getNextProxyAgent(targetUrl) {
  const proxies = getProxyConfigs();

  if (!Array.isArray(proxies) || proxies.length === 0) {
    return null;
  }

  const currentSnapshot = snapshotConfigs(proxies);
  if (currentSnapshot !== lastSnapshot) {
    proxyIndex = 0;
    lastSnapshot = currentSnapshot;
    logInfo('Proxy configuration changed, round-robin index reset');
  }

  for (let attempt = 0; attempt < proxies.length; attempt += 1) {
    const index = (proxyIndex + attempt) % proxies.length;
    const proxy = proxies[index];

    if (!proxy || typeof proxy.url !== 'string' || proxy.url.trim() === '') {
      logError('Invalid proxy configuration encountered', new Error(`Proxy entry at index ${index} is missing a url`));
      continue;
    }

    try {
      const agent = new HttpsProxyAgent(proxy.url);
      proxyIndex = (index + 1) % proxies.length;

      const label = proxy.name || proxy.url;
      logInfo(`Using proxy ${label} for request to ${targetUrl}`);

      return { agent, proxy };
    } catch (error) {
      logError(`Failed to create proxy agent for ${proxy.url}`, error);
    }
  }

  logError('All configured proxies failed to initialize', new Error('Proxy initialization failure'));
  return null;
}

