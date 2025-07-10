import { cloudflareDevProxyVitePlugin as remixCloudflareDevProxy, vitePlugin as remixVitePlugin } from '@remix-run/dev';
import UnoCSS from 'unocss/vite';
import { defineConfig, type ViteDevServer } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { optimizeCssModules } from 'vite-plugin-optimize-css-modules';
import tsconfigPaths from 'vite-tsconfig-paths';
import * as dotenv from 'dotenv';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

dotenv.config();

// Get git hash with fallback
const getGitHash = () => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'no-git-info';
  }
};

// Read package.json with detailed dependency info
const getPackageJson = () => {
  try {
    const pkgPath = join(process.cwd(), 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

    return {
      name: pkg.name,
      description: pkg.description,
      license: pkg.license,
      dependencies: pkg.dependencies || {},
      devDependencies: pkg.devDependencies || {},
      peerDependencies: pkg.peerDependencies || {},
      optionalDependencies: pkg.optionalDependencies || {},
    };
  } catch {
    return {
      name: 'bolt.diy',
      description: 'A DIY LLM interface',
      license: 'MIT',
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
      optionalDependencies: {},
    };
  }
};

const pkg = getPackageJson();

export default defineConfig((config) => {
  return {
    resolve: {
      alias: {
        '~': resolve(__dirname, './app')
      }
    },
    server: {
      host: true,
      allowedHosts: ['vibescoded.com', 'localhost' , 'www.vibescoded.com'],
      hmr: {
        overlay: false
      },
      fs: {
        strict: false
      }
    },
    define: {
      __COMMIT_HASH: JSON.stringify(getGitHash()),
      __APP_VERSION: JSON.stringify(process.env.npm_package_version),
      __PKG_NAME: JSON.stringify(pkg.name),
      __PKG_DESCRIPTION: JSON.stringify(pkg.description),
      __PKG_LICENSE: JSON.stringify(pkg.license),
      __PKG_DEPENDENCIES: JSON.stringify(pkg.dependencies),
      __PKG_DEV_DEPENDENCIES: JSON.stringify(pkg.devDependencies),
      __PKG_PEER_DEPENDENCIES: JSON.stringify(pkg.peerDependencies),
      __PKG_OPTIONAL_DEPENDENCIES: JSON.stringify(pkg.optionalDependencies),
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
    },
    build: {
      sourcemap: config.mode === 'development',
      modulePreload: {
        polyfill: false
      },
      minify: 'esbuild',
      emptyOutDir: true,
      cssCodeSplit: true,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 2000,
      target: 'esnext',
      rollupOptions: {
        output: {
          // Manual chunk splitting for better caching and loading performance
          manualChunks: (id) => {
            // Skip manual chunking for SSR builds
            if (process.env.BUILD_TARGET === 'ssr') {
              return undefined;
            }
            
            // Only chunk the most stable, independent libraries to avoid circular dependencies
            
            // Core React (most stable)
            if (id.includes('node_modules/react/') && !id.includes('node_modules/react-')) {
              return 'vendor-react-core';
            }
            if (id.includes('node_modules/react-dom/')) {
              return 'vendor-react-dom';
            }
            
            // CodeMirror (self-contained)
            if (id.includes('@codemirror/') || id.includes('@lezer/')) {
              return 'vendor-codemirror';
            }
            
            // Radix UI (self-contained)
            if (id.includes('@radix-ui/')) {
              return 'vendor-radix';
            }
            
            // Framer Motion (self-contained)
            if (id.includes('framer-motion')) {
              return 'vendor-framer';
            }
            
            // Terminal (self-contained)
            if (id.includes('@xterm/')) {
              return 'vendor-xterm';
            }
            
            // WebContainer (self-contained)
            if (id.includes('@webcontainer/api')) {
              return 'vendor-webcontainer';
            }
            
            // AI SDK (self-contained)
            if (id.includes('node_modules/ai/') || id.includes('@ai-sdk/')) {
              return 'vendor-ai';
            }
            
            // Shiki (large but self-contained)
            if (id.includes('shiki')) {
              return 'vendor-shiki';
            }
            
            // Everything else goes into the main chunk to avoid dependency issues
            return undefined;
          },
          // Optimize chunk file names for better caching
          chunkFileNames: (chunkInfo) => {
            // Use content hash for vendor chunks for better caching
            if (chunkInfo.name?.startsWith('vendor-')) {
              return `assets/vendor/[name]-[hash].js`;
            }
            return `assets/[name]-[hash].js`;
          },
          // Optimize entry file names
          entryFileNames: `assets/[name]-[hash].js`,
          // Optimize asset file names
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name?.split('.') ?? [];
            const ext = info[info.length - 1];
            if (/\.(css)$/.test(assetInfo.name ?? '')) {
              return `assets/css/[name]-[hash].${ext}`;
            }
            if (/\.(png|jpe?g|svg|gif|tiff|bmp|ico)$/i.test(assetInfo.name ?? '')) {
              return `assets/images/[name]-[hash].${ext}`;
            }
            if (/\.(woff2?|eot|ttf|otf)$/i.test(assetInfo.name ?? '')) {
              return `assets/fonts/[name]-[hash].${ext}`;
            }
            return `assets/[name]-[hash].${ext}`;
          }
        }
      }
    },
    esbuild: {
      treeShaking: true,
      minifyIdentifiers: true,
      minifySyntax: true,
      minifyWhitespace: true,
      keepNames: config.mode === 'development',
      legalComments: 'none',
      drop: config.mode === 'production' ? ['console', 'debugger'] : []
    },
    optimizeDeps: {
      include: [
        'react', 
        'react-dom', 
        '@remix-run/react',
        '@radix-ui/react-dialog',
        '@radix-ui/react-dropdown-menu',
        '@codemirror/state',
        '@codemirror/view',
        '@codemirror/commands',
        'framer-motion',
        'ai',
        '@nanostores/react',
        'nanostores'
      ],
      exclude: ['node_modules/*.mjs']
    },
    plugins: [
      nodePolyfills({
        include: ['buffer', 'process', 'util', 'stream'],
        globals: {
          Buffer: true,
          process: true,
          global: true,
        },
        protocolImports: true,
        exclude: ['child_process', 'fs', 'path'],
      }),
      {
        name: 'buffer-polyfill',
        transform(code, id) {
          if (id.includes('env.mjs')) {
            return {
              code: `import { Buffer } from 'buffer';\n${code}`,
              map: null,
            };
          }
          return null;
        },
      },
      config.mode !== 'test' && remixCloudflareDevProxy(),
      remixVitePlugin({
        future: {
          v3_fetcherPersist: true,
          v3_relativeSplatPath: true,
          v3_throwAbortReason: true,
          v3_lazyRouteDiscovery: true,
        },
      }),
      UnoCSS(),
      tsconfigPaths(),
      chrome129IssuePlugin(),
      config.mode === 'production' && optimizeCssModules({ apply: 'build' }),
    ],
    envPrefix: [
      'VITE_',
      'OPENAI_LIKE_API_BASE_URL',
      'OLLAMA_API_BASE_URL',
      'LMSTUDIO_API_BASE_URL',
      'TOGETHER_API_BASE_URL',
    ],
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
        },
      },
      modules: {
        generateScopedName: config.mode === 'production' 
          ? '[hash:base64:8]' 
          : '[local]_[hash:base64:5]'
      }
    },
  };
});

function chrome129IssuePlugin() {
  return {
    name: 'chrome129IssuePlugin',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const raw = req.headers['user-agent']?.match(/Chrom(e|ium)\/([0-9]+)\./);

        if (raw) {
          const version = parseInt(raw[2], 10);

          if (version === 129) {
            res.setHeader('content-type', 'text/html');
            res.end(
              '<body><h1>Please use Chrome Canary for testing.</h1><p>Chrome 129 has an issue with JavaScript modules & Vite local development, see <a href="https://github.com/stackblitz/bolt.new/issues/86#issuecomment-2395519258">for more information.</a></p><p><b>Note:</b> This only impacts <u>local development</u>. `pnpm run build` and `pnpm run start` will work fine in this browser.</p></body>',
            );

            return;
          }
        }

        next();
      });
    },
  };
}
