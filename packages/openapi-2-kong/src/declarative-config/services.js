// @flow

import {
  fillServerVariables,
  generateSlug,
  getAllServers,
  getName,
  pathVariablesToRegex,
  HttpMethod,
  parseUrl,
} from '../common';

import { generateSecurityPlugins } from './security-plugins';
import {
  generateOperationPlugins,
  generatePathPlugins,
  generateGlobalPlugins,
  getRequestValidatorPluginDirective,
} from './plugins';

export function generateServices(api: OpenApi3Spec, tags: Array<string>): Array<DCService> {
  const servers = getAllServers(api);

  if (servers.length === 0) {
    throw new Error('no servers defined in spec');
  }

  // only support one service for now
  const service = generateService(servers[0], api, tags);
  return [service];
}

export function generateService(
  server: OA3Server,
  api: OpenApi3Spec,
  tags: Array<string>,
): DCService {
  const serverUrl = fillServerVariables(server);
  const name = getName(api);
  const parsedUrl = parseUrl(serverUrl);

  // Service plugins
  const globalPlugins = generateGlobalPlugins(api);

  const service: DCService = {
    name,
    // remove semicolon ie. convert https: to https
    protocol: parsedUrl.protocol.substring(0, parsedUrl.protocol.length - 1),
    host: name, // not a hostname, but the Upstream name
    port: Number(parsedUrl.port || '80'),
    path: parsedUrl.pathname,
    plugins: globalPlugins.plugins,
    routes: [],
    tags,
  };

  for (const routePath of Object.keys(api.paths)) {
    const pathItem: OA3PathItem = api.paths[routePath];

    const pathValidatorPlugin = getRequestValidatorPluginDirective(pathItem);
    const pathPlugins = generatePathPlugins(pathItem);

    for (const method of Object.keys(pathItem)) {
      if (
        method !== 'get' &&
        method !== 'put' &&
        method !== 'post' &&
        method !== 'delete' &&
        method !== 'options' &&
        method !== 'head' &&
        method !== 'patch' &&
        method !== 'trace'
      ) {
        continue;
      }

      const operation: ?OA3Operation = pathItem[method];

      // This check is here to make Flow happy
      if (!operation) {
        continue;
      }

      // Create the base route object
      const fullPathRegex = pathVariablesToRegex(routePath);
      const route: DCRoute = {
        tags,
        name: generateRouteName(api, routePath, method),
        methods: [method.toUpperCase()],
        paths: [fullPathRegex],
        strip_path: false,
      };

      // Generate generic and security-related plugin objects
      const securityPlugins = generateSecurityPlugins(operation, api);
      const regularPlugins = generateOperationPlugins(
        operation,
        pathPlugins,
        pathValidatorPlugin || globalPlugins.requestValidatorPlugin, // Path plugin takes precedence over global
      );
      const plugins = [...regularPlugins, ...securityPlugins];

      // Add plugins if there are any
      if (plugins.length) {
        route.plugins = plugins;
      }

      service.routes.push(route);
    }
  }

  return service;
}

export function generateRouteName(
  api: OpenApi3Spec,
  routePath: string,
  method: $Keys<typeof HttpMethod>,
): string {
  const name = getName(api);
  const pathItem = api.paths[routePath];

  if (pathItem[method] && typeof pathItem[method]['x-kong-name'] === 'string') {
    return generateSlug(pathItem[method]['x-kong-name']);
  }

  if (pathItem[method] && pathItem[method].operationId) {
    return pathItem[method].operationId;
  }

  // replace all `/` with `-` except the ones at the beginng or end of a string
  const replacedRoute = routePath.replace(/(?!^)\/(?!$)/g, '-');
  const pathSlug = generateSlug(pathItem['x-kong-name'] || replacedRoute);
  return `${name}${pathSlug ? `-${pathSlug}` : ''}-${method}`;
}
