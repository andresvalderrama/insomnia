// @flow

import { getName, parseUrl, fillServerVariables } from '../common';

export function generateUpstreams(api: OpenApi3Spec, tags: Array<string>) {
  const servers = api.servers || [];

  if (servers.length === 0) {
    return [];
  }

  // $FlowFixMe
  const upstreamDefaults: XKongUpstreamDefaults = api['x-kong-upstream-defaults'] || {};

  // $FlowFixMe
  const upstream: DCUpstream = {
    ...upstreamDefaults,
    name: getName(api),
    targets: [],
    tags,
  };

  for (const server of servers) {
    const serverWithVars = fillServerVariables(server);
    const hostWithPort = parseUrl(serverWithVars).host;

    if (hostWithPort) {
      upstream.targets.push({
        target: hostWithPort,
      });
    }
  }

  return [upstream];
}
