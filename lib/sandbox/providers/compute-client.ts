import { compute } from 'computesdk';
import type { SandboxInfo } from '../types';
import { appConfig } from '@/config/app.config';

export class ComputeSandbox {
  private sandbox: any | null = null;
  private sandboxInfo: SandboxInfo | null = null;

  async createSandboxAndTest(): Promise<void> {
    this.sandbox = await compute.sandbox.create();

    const sandboxId = this.sandbox?.sandboxId || 'unknown';
    this.sandboxInfo = {
      sandboxId,
      url: '',
      provider: 'e2b',
      createdAt: new Date(),
    };

    console.log('[ComputeSandbox] Created sandbox:', this.sandboxInfo);

    await this.testComputeClient();
  }

  async testComputeClient(): Promise<void> {
    console.log('[ComputeSandbox:testComputeClient] Starting client test...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 1: Create /app directory and scaffold minimal Vite app
    console.log('[ComputeSandbox:testComputeClient] Creating /app directory...');
    await this.sandbox.runCommand('mkdir', ['-p', 'app/src']);
    // package.json
    const packageJson = {
      name: 'test-vite-app',
      version: '1.0.0',
      type: 'module',
      scripts: {
        dev: 'vite --host',
        build: 'vite build',
        preview: 'vite preview'
      },
      dependencies: {
        react: '^18.2.0',
        'react-dom': '^18.2.0'
      },
      devDependencies: {
        '@vitejs/plugin-react': '^4.0.0',
        vite: '^5.0.0'
      }
    };
    await this.sandbox.filesystem.writeFile('app/package.json', JSON.stringify(packageJson, null, 2));
    console.log('[ComputeSandbox:testComputeClient] Wrote package.json');

    // vite.config.js
    const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: ${appConfig.baseProviderConfig.vitePort},
    strictPort: true,
    hmr: false,
    allowedHosts: ['.e2b.app', '.e2b.dev', '.vercel.run', 'localhost', '127.0.0.1', '.computesdk.com', '.proxy.daytona.work', '.modal.host', '.modal.run'],
  },
})
`;
    await this.sandbox.filesystem.writeFile('app/vite.config.js', viteConfig);
    console.log('[ComputeSandbox:testComputeClient] Wrote vite.config.js');

    // index.html
    const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Test Vite App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`;
    await this.sandbox.filesystem.writeFile('app/index.html', indexHtml);
    console.log('[ComputeSandbox:testComputeClient] Wrote index.html');

    // src/main.jsx
    const mainJsx = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`;
    await this.sandbox.filesystem.writeFile('app/src/main.jsx', mainJsx);
    console.log('[ComputeSandbox:testComputeClient] Wrote src/main.jsx');

    // src/App.jsx
    const appJsx = `function App() {
  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <h1>🎉 Vite App Running!</h1>
      <p>This is a test app running in the Compute sandbox.</p>
    </div>
  )
}

export default App
`;
    await this.sandbox.filesystem.writeFile('app/src/App.jsx', appJsx);
    console.log('[ComputeSandbox:testComputeClient] Wrote src/App.jsx');

    // Step 2: Install dependencies    
    console.log('[ComputeSandbox:testComputeClient] Running npm install in app/');
    const installResult = await this.sandbox.runCommand('bash', ['-c', 'cd app && npm install']);
    console.log('[ComputeSandbox:testComputeClient] npm install exitCode:', installResult.exitCode);
    if (installResult.stdout) {
      console.log('[ComputeSandbox:testComputeClient] npm install stdout:', installResult.stdout.substring(0, 500));
    }
    if (installResult.stderr) {
      console.log('[ComputeSandbox:testComputeClient] npm install stderr:', installResult.stderr.substring(0, 500));
    }

    // Step 3: Start Vite dev server (background process)
    console.log('[ComputeSandbox:testComputeClient] Starting Vite dev server...');
    this.sandbox.runCommand('bash', ['-c', 'cd app && npm run dev > vite.log 2>&1'], {
      background: true,
    }).catch((e: any) => {
      console.error('[ComputeSandbox:testComputeClient] npm run dev Vite error:', e.message);
    });

    // Wait for Vite to start
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Step 4: Get preview URL using sandbox.getUrl()
    const previewUrl = await this.sandbox.getUrl({ port: 5173 });
    console.log('[ComputeSandbox:testComputeClient] ========================================');
    console.log('[ComputeSandbox:testComputeClient] PREVIEW URL:', previewUrl);
    console.log('[ComputeSandbox:testComputeClient] ========================================');

    // Store in sandboxInfo
    if (this.sandboxInfo) {
      this.sandboxInfo.url = previewUrl;
    }

    console.log('[ComputeSandbox:testComputeClient] Test complete.');
  }

  async destroySandbox(): Promise<void> {
    if (!this.sandbox) {
      console.log('[ComputeSandbox] No sandbox to destroy');
      return;
    }

    const sandboxId = this.sandbox.sandboxId;
    console.log(`[ComputeSandbox] Destroying sandbox: ${sandboxId}`);
    console.log(`[ComputeSandbox] - typeof this.sandbox: ${typeof this.sandbox}`);
    console.log(`[ComputeSandbox] - constructor.name: ${this.sandbox?.constructor?.name}`);
    console.log(`[ComputeSandbox] - has destroy: ${typeof this.sandbox?.destroy}`);
    console.log(`[ComputeSandbox] - keys:`, Object.keys(this.sandbox));
    
    try {
      const result = await this.sandbox.destroy();
      console.log(`[ComputeSandbox] destroy() returned:`, result);
      console.log(`[ComputeSandbox] Sandbox ${sandboxId} destroyed successfully`);
    } catch (e) {
      console.error(`[ComputeSandbox] Failed to destroy sandbox ${sandboxId}:`, e);
      throw e;
    } finally {
      this.sandbox = null;
      this.sandboxInfo = null;
    }
  }

  getSandbox(): any {
    return this.sandbox;
  }
}