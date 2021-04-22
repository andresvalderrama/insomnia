// @flow
import { generateServices } from '../services';
import { parseSpec } from '../../index';

const baseSpec = {
  openapi: '3.0',
  info: { version: '1.0', title: 'My API' },
  servers: [{ url: 'https://server1.com/path' }],
  paths: {
    '/cats': {
      'x-kong-name': 'Cat stuff',
      summary: 'summary is ignored',
      post: {},
    },
    '/dogs': {
      summary: 'Dog stuff',
      get: {},
      post: { summary: 'Ignored summary' },
    },
    '/birds/{id}': {
      get: {},
    },
  },
};

const baseSpecResult = {
  name: 'My_API',
  protocol: 'https',
  host: 'My_API',
  port: 443,
  path: '/path',
  plugins: [],
  tags: ['Tag'],
  routes: [
    {
      name: 'My_API-Cat_stuff-post',
      strip_path: false,
      methods: ['POST'],
      paths: ['/cats$'],
      tags: ['Tag'],
    },
    {
      name: 'My_API-dogs-get',
      strip_path: false,
      methods: ['GET'],
      paths: ['/dogs$'],
      tags: ['Tag'],
    },
    {
      name: 'My_API-dogs-post',
      strip_path: false,
      methods: ['POST'],
      paths: ['/dogs$'],
      tags: ['Tag'],
    },
    {
      name: 'My_API-birds_id-get',
      strip_path: false,
      methods: ['GET'],
      paths: ['/birds/(?<id>[^\\/\\s]+)$'],
      tags: ['Tag'],
    },
  ],
};

describe('services', () => {
  describe('generateServices()', () => {
    it('generates generic service with paths', async () => {
      const api = await parseSpec(baseSpec);

      const result = generateServices(api, ['Tag']);
      expect(result).toEqual([baseSpecResult]);
    });

    it('generates routes with request validator plugin from operation over path over global', async () => {
      const api: OpenApi3Spec = await parseSpec({
        ...baseSpec,
        'x-kong-plugin-request-validator': { config: { parameter_schema: 'global' } }, // global req validator plugin
        paths: {
          ...baseSpec.paths,
          '/cats': {
            ...baseSpec.paths['/cats'],
            'x-kong-plugin-request-validator': { config: { parameter_schema: 'path' } }, // path req validator plugin
            get: {},
            post: {
              'x-kong-plugin-request-validator': {
                config: { parameter_schema: 'operation' }, // operation req validator plugin
              },
            },
          },
          '/dogs': {
            ...baseSpec.paths['/dogs'],
            post: {
              ...baseSpec.paths['/dogs'].post,
              'x-kong-plugin-request-validator': {
                // operation req validator plugin
                config: { parameter_schema: 'operation' },
              },
            },
          },
        },
      });

      const result = generateServices(api, ['Tag']);
      expect(result).toEqual([
        {
          ...baseSpecResult,
          plugins: [
            {
              config: { version: 'draft4', parameter_schema: 'global' },
              enabled: true,
              name: 'request-validator',
            },
          ],
          routes: [
            {
              tags: ['Tag'],
              name: 'My_API-Cat_stuff-post',
              methods: ['POST'],
              paths: ['/cats$'],
              strip_path: false,
              plugins: [
                {
                  // should have operation plugin
                  config: { version: 'draft4', parameter_schema: 'operation' },
                  enabled: true,
                  name: 'request-validator',
                },
              ],
            },
            {
              tags: ['Tag'],
              name: 'My_API-Cat_stuff-get',
              methods: ['GET'],
              paths: ['/cats$'],
              strip_path: false,
              plugins: [
                {
                  // should apply path plugin
                  config: { version: 'draft4', parameter_schema: 'path' },
                  enabled: true,
                  name: 'request-validator',
                },
              ],
            },
            {
              tags: ['Tag'],
              name: 'My_API-dogs-get',
              methods: ['GET'],
              paths: ['/dogs$'],
              strip_path: false,
              plugins: [
                {
                  // should apply global plugin
                  config: { version: 'draft4', parameter_schema: 'global' },
                  enabled: true,
                  name: 'request-validator',
                },
              ],
            },
            {
              tags: ['Tag'],
              name: 'My_API-dogs-post',
              methods: ['POST'],
              paths: ['/dogs$'],
              strip_path: false,
              plugins: [
                {
                  // should have operation plugin
                  config: { version: 'draft4', parameter_schema: 'operation' },
                  enabled: true,
                  name: 'request-validator',
                },
              ],
            },
            {
              tags: ['Tag'],
              name: 'My_API-birds_id-get',
              methods: ['GET'],
              paths: ['/birds/(?<id>[^\\/\\s]+)$'],
              strip_path: false,
              plugins: [
                {
                  // should apply global plugin
                  config: { version: 'draft4', parameter_schema: 'global' },
                  enabled: true,
                  name: 'request-validator',
                },
              ],
            },
          ],
        },
      ]);
    });

    it('generates routes with plugins from operation over path', async () => {
      const api: OpenApi3Spec = await parseSpec({
        openapi: '3.0',
        info: { version: '1.0', title: 'My API' },
        servers: [
          {
            url: 'https://server1.com/path',
          },
        ],
        paths: {
          '/dogs': {
            summary: 'Dog stuff',
            'x-kong-plugin-key-auth': {
              config: {
                key_names: ['path'],
              },
            },
            get: {},
            post: {
              'x-kong-plugin-key-auth': {
                config: {
                  key_names: ['operation'],
                },
              },
            },
          },
        },
      });

      const result = generateServices(api, ['Tag']);
      expect(result).toEqual([
        {
          name: 'My_API',
          protocol: 'https',
          host: 'My_API',
          port: 443,
          path: '/path',
          plugins: [],
          tags: ['Tag'],
          routes: [
            {
              name: 'My_API-dogs-get',
              strip_path: false,
              methods: ['GET'],
              paths: ['/dogs$'],
              tags: ['Tag'],
              plugins: [
                {
                  name: 'key-auth',
                  tags: ['OAS3_import'],
                  // should apply path plugin
                  config: { key_names: ['path'] },
                },
              ],
            },
            {
              name: 'My_API-dogs-post',
              strip_path: false,
              methods: ['POST'],
              paths: ['/dogs$'],
              tags: ['Tag'],
              plugins: [
                {
                  name: 'key-auth',
                  tags: ['OAS3_import'],
                  // should apply path plugin
                  config: { key_names: ['operation'] },
                },
              ],
            },
          ],
        },
      ]);
    });

    it('fails with no servers', async () => {
      const { servers, ...rest } = baseSpec;

      const api = await parseSpec(rest);

      const fn = () => generateServices(api, ['Tag']);
      expect(fn).toThrowError('no servers defined in spec');
    });

    it('replaces variables', async () => {
      const api = await parseSpec({
        ...baseSpec,
        servers: [
          {
            url: 'https://{customerId}.saas-app.com:{port}/v2',
            variables: {
              customerId: { default: 'demo' },
              port: { enum: ['443', '8443'], default: '8443' },
            },
          },
        ],
      });

      expect(generateServices(api, ['Tag'])).toEqual([
        {
          ...baseSpecResult,
          protocol: 'https',
          host: 'My_API',
          port: 8443,
          path: '/v2',
        },
      ]);
    });

    describe('overriding options', () => {
      it('will add options to the route with `x-kong-route-defaults` at the root', async () => {
        const api = await parseSpec({
          ...baseSpec,
          'x-kong-route-defaults': {
            foo: 'bar',
          },
        });

        expect(generateServices(api, ['Tag'])).toEqual([
          {
            ...baseSpecResult,
            routes: baseSpecResult.routes.map(route => ({
              ...route,
              foo: 'bar',
            })),
          },
        ]);
      });

      it('will add options on the route with `x-kong-route-defaults` at the root', async () => {
        const api = await parseSpec({
          ...baseSpec,
          'x-kong-route-defaults': {
            foo: 'bar',
          },
          paths: {
            ...baseSpec.paths,
            '/cats': {
              ...baseSpec.paths['/cats'],
            },
          },
        });

        expect(generateServices(api, ['Tag'])).toEqual([
          {
            ...baseSpecResult,
            routes: [...baseSpecResult.routes].map(route => ({
              ...route,
              foo: 'bar',
            })),
          },
        ]);
      });

      it('x-kong-route-defaults only works at the root', async () => {
        const api = await parseSpec({
          ...baseSpec,
          paths: {
            ...baseSpec.paths,
            '/cats': {
              ...baseSpec.paths['/cats'],
              'x-kong-route-defaults': {
                foo: 'will be ignored, by design',
              },
            },
          },
        });

        expect(generateServices(api, ['Tag'])).toEqual([baseSpecResult]);
      });

      it('allows overriding strip_path at the path level', async () => {
        const api = await parseSpec({
          ...baseSpec,
          paths: {
            ...baseSpec.paths,
            '/cats': {
              ...baseSpec.paths['/cats'],
              strip_path: true,
            },
          },
        });

        expect(generateServices(api, ['Tag'])).toEqual([
          {
            ...baseSpecResult,
            routes: baseSpecResult.routes.map(route => ({
              ...route,
              // $FlowFixMe
              ...(route.paths[0] === '/cats$' ? { strip_path: true } : {}),
            })),
          },
        ]);
      });

      it('allows overriding `strip_path` from `x-kong-route-defaults` at the root', async () => {
        const api = await parseSpec({
          ...baseSpec,
          'x-kong-route-defaults': {
            strip_path: true,
          },
        });

        expect(generateServices(api, ['Tag'])).toEqual([
          {
            ...baseSpecResult,
            routes: [...baseSpecResult.routes].map(route => ({
              ...route,
              strip_path: true,
            })),
          },
        ]);
      });
    });
  });
});
