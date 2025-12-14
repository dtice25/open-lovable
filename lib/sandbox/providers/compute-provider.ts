import { createCompute } from 'computesdk';
import { e2b } from '@computesdk/e2b';
import { vercel } from '@computesdk/vercel';
import { SandboxProvider, SandboxInfo, CommandResult, SandboxProviderConfig } from '../types';
import appConfig from '@/config/app.config';

const WORKING_DIR = 'app';

export class ComputeProvider extends SandboxProvider {
  private compute = createCompute({
    provider: vercel({
      token: process.env.VERCEL_TOKEN || process.env.VERCEL_OIDC_TOKEN,
      teamId: process.env.VERCEL_TEAM_ID,
      projectId: process.env.VERCEL_PROJECT_ID,
      // apiKey: process.env.E2B_API_KEY!,
      timeout: appConfig.baseProviderConfig.timeoutMs,
      runtime: 'node',
      ports: [appConfig.baseProviderConfig.vitePort],
    }),
    apiKey: process.env.COMPUTESDK_API_KEY,
  });

  constructor(config: SandboxProviderConfig) {
    super(config);
  }

  private resolvePath(path: string): string {
    if (!path || path === '.') {
      return WORKING_DIR;
    }
    if (path.startsWith('/')) {
      return path;
    }
    return `${WORKING_DIR.replace(/\/$/, '')}/${path}`;
  }

  private async getComputeStatus(): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const apiKey = process.env.COMPUTESDK_API_KEY;
    if (!apiKey) {
      throw new Error('COMPUTESDK_API_KEY environment variable is not set');
    }

    // Quick retry loop - check every 500ms for up to 10 seconds
    const maxWaitMs = 10000;
    const pollIntervalMs = 500;
    const startTime = Date.now();
    let status: any;

    console.log('[ComputeProvider:getComputeStatus] Checking compute status...');
    while (Date.now() - startTime < maxWaitMs) {
      status = await this.sandbox.runCommand('compute status');
      if (status.exitCode === 0) {
        console.log(`[ComputeProvider:getComputeStatus] Compute ready after ${Date.now() - startTime}ms`);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    // Only curl if still not available after retries
    if (status.exitCode !== 0) {
      console.log('[ComputeProvider:getComputeStatus] Compute CLI not auto-installed, installing via curl...');
      const installCommand = `echo 'n' | curl -fsSL https://computesdk.com/install.sh | bash -s -- --api-key ${apiKey}`;
      const installResult = await this.sandbox.runCommand(installCommand);
      console.log('[ComputeProvider:getComputeStatus] installResult exitCode:', installResult.exitCode);

      // Check status again after install
      status = await this.sandbox.runCommand('compute status');
    }

    if (status.exitCode !== 0) {
      const message = status.stderr || status.stdout || 'Failed to get Compute status';
      throw new Error(String(message));
    }
  }

  async createSandbox(): Promise<SandboxInfo> {
    try {
      if (this.sandbox) {
        try {
          await this.sandbox.destroy();
        } catch (e) {
          console.error('[ComputeProvider] Failed to close existing sandbox:', e);
        }
        this.sandbox = null;
        this.sandboxInfo = null;
      }

      console.log('[ComputeProvider] Creating E2B sandbox via ComputeSDK...');
      this.sandbox = await this.compute.sandbox.create();

      const sandboxId = this.sandbox.sandboxId;

      // Wait for Compute CLI to be ready
      await this.getComputeStatus();

      // Get preview URL for Vite port - no token needed
      const previewUrl = await this.sandbox.getUrl({ port: appConfig.baseProviderConfig.vitePort });
      console.log('[ComputeProvider] Preview URL:', previewUrl);

      this.sandboxInfo = {
        sandboxId,
        url: previewUrl,
        provider: 'vercel',
        createdAt: new Date(),
      };

      console.log('[ComputeProvider] Sandbox created:', this.sandboxInfo);
      return this.sandboxInfo;
    } catch (error) {
      console.error('[ComputeProvider] Error creating sandbox:', error);
      throw error;
    }
  }

  async runCommand(command: string): Promise<CommandResult> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    console.log('[ComputeProvider] runCommand:', command);

    const result = await this.sandbox.runCommand(command);

    const stdout = String(result.stdout || '');
    const stderr = String(result.stderr || '');
    const exitCode = typeof result.exitCode === 'number' ? result.exitCode : 0;

    return {
      stdout,
      stderr,
      exitCode,
      success: exitCode === 0,
    };
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const fullPath = this.resolvePath(path);
    const start = Date.now();
    console.log('[ComputeProvider] writeFile start:', fullPath);

    // Ensure parent directory exists
    const dirPath = fullPath.includes('/')
      ? fullPath.substring(0, fullPath.lastIndexOf('/'))
      : '';
    if (dirPath) {
      await this.sandbox.runCommand(`mkdir -p ${dirPath}`);
    }

    await this.sandbox.writeFile(fullPath, content);

    const durationMs = Date.now() - start;
    console.log('[ComputeProvider] writeFile done:', fullPath, 'durationMs=', durationMs);
  }

  async readFile(path: string): Promise<string> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const fullPath = this.resolvePath(path);
    console.log('[ComputeProvider] readFile:', fullPath);
    
    // Use cat command instead of sandbox.readFile to avoid timeout issues
    const result = await this.sandbox.runCommand(`cat ${fullPath}`);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file ${fullPath}: ${result.stderr || 'File not found'}`);
    }
    return String(result.stdout ?? '');
  }

  async listFiles(directory: string = WORKING_DIR): Promise<string[]> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const fullPath = this.resolvePath(directory);
    console.log('[ComputeProvider] listFiles in:', fullPath);

    const result = await this.sandbox.runCommand(`ls -1 ${fullPath}`);
    if (result.exitCode !== 0 || !result.stdout) {
      return [];
    }

    return result.stdout.trim().split('\n').filter(Boolean);
  }

  async installPackages(packages: string[]): Promise<CommandResult> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    if (!packages || packages.length === 0) {
      return { stdout: '', stderr: '', exitCode: 0, success: true };
    }

    const flags = appConfig.packages.useLegacyPeerDeps ? '--legacy-peer-deps' : '';
    const pkgList = packages.join(' ');

    const command = flags
      ? `cd ${WORKING_DIR} && npm install ${flags} ${pkgList}`
      : `cd ${WORKING_DIR} && npm install ${pkgList}`;

    const start = Date.now();
    console.log('[ComputeProvider] installPackages command:', command);

    const result = await this.sandbox.runCommand(command);

    const stdout = String(result.stdout || '');
    const stderr = String(result.stderr || '');
    const exitCode = typeof result.exitCode === 'number' ? result.exitCode : 0;

    const durationMs = Date.now() - start;
    console.log('[ComputeProvider] installPackages exitCode:', exitCode, 'durationMs=', durationMs);
    if (stdout) {
      console.log('[ComputeProvider] installPackages stdout (truncated):', stdout.substring(0, 1000));
    }
    if (stderr) {
      console.log('[ComputeProvider] installPackages stderr (truncated):', stderr.substring(0, 1000));
    }

    if (appConfig.packages.autoRestartVite && exitCode === 0) {
      console.log('[ComputeProvider] installPackages: autoRestartVite enabled, restarting Vite...');
      await this.restartViteServer();
    }

    return {
      stdout,
      stderr,
      exitCode,
      success: exitCode === 0,
    };
  }

  async setupViteApp(): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const start = Date.now();
    console.log('[ComputeProvider] setupViteApp: creating minimal Vite+React structure in', WORKING_DIR);

    // Create basic directory structure
    await this.sandbox.runCommand(`mkdir -p ${WORKING_DIR}/src`);

    const packageJson = {
      name: 'sandbox-app',
      version: '1.0.0',
      type: 'module',
      scripts: {
        dev: 'vite --host',
        build: 'vite build',
        preview: 'vite preview',
      },
      dependencies: {
        react: '^18.2.0',
        'react-dom': '^18.2.0',
      },
      devDependencies: {
        '@vitejs/plugin-react': '^4.0.0',
        vite: '^4.3.9',
        tailwindcss: '^3.3.0',
        postcss: '^8.4.31',
        autoprefixer: '^10.4.16'
      },
    };

    await this.sandbox.writeFile(`${WORKING_DIR}/package.json`, JSON.stringify(packageJson, null, 2));

    const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: ${appConfig.baseProviderConfig.vitePort},
    strictPort: true,
    hmr: false,
    allowedHosts: ['.e2b.app', '.e2b.dev', '.vercel.run', 'localhost', '127.0.0.1', '.computesdk.com'],
  },
})
`;
    await this.sandbox.writeFile(`${WORKING_DIR}/vite.config.js`, viteConfig);

    const tailwindConfig = `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
`;
    await this.sandbox.writeFile(`${WORKING_DIR}/tailwind.config.js`, tailwindConfig);

    const postcssConfig = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`;
    await this.sandbox.writeFile(`${WORKING_DIR}/postcss.config.js`, postcssConfig);

    const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Compute Sandbox App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`;
    await this.sandbox.writeFile(`${WORKING_DIR}/index.html`, indexHtml);

    const mainJsx = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`;
    await this.sandbox.writeFile(`${WORKING_DIR}/src/main.jsx`, mainJsx);

    const appJsx = `function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="text-center max-w-2xl">
        <p className="text-lg text-gray-400">
          Sandbox Ready<br/>
          Start building your React app with Vite and Tailwind CSS!
        </p>
      </div>
    </div>
  )
}

export default App
`;
    await this.sandbox.writeFile(`${WORKING_DIR}/src/App.jsx`, appJsx);

    const indexCss = `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background-color: rgb(17 24 39);
}
`;
    await this.sandbox.writeFile(`${WORKING_DIR}/src/index.css`, indexCss);

    console.log('[ComputeProvider] setupViteApp: files written, running npm install...');

    const flags = appConfig.packages.useLegacyPeerDeps ? '--legacy-peer-deps' : '';
    const installCommand = flags
      ? `cd ${WORKING_DIR} && npm install ${flags}`
      : `cd ${WORKING_DIR} && npm install`;

    const installResult = await this.sandbox.runCommand(installCommand);
    console.log('[ComputeProvider] npm install exitCode:', installResult.exitCode);
    if (installResult.stdout) {
      console.log('[ComputeProvider] npm install stdout (truncated):', String(installResult.stdout).substring(0, 1000));
    }

    console.log('[ComputeProvider] setupViteApp: starting Vite dev server...');
    await this.restartViteServer();

    const durationMs = Date.now() - start;
    console.log('[ComputeProvider] setupViteApp done, durationMs=', durationMs);
  }

  async restartViteServer(): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }
    const start = Date.now();

    // Kill existing Vite process
    await this.sandbox.runCommand('pkill -f vite || true');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Start Vite dev server in background, log to file for debugging - fire and forget
    this.sandbox.runCommand(`cd ${WORKING_DIR} && nohup npm run dev > vite.log 2>&1 &`);

    await new Promise(resolve => setTimeout(resolve, appConfig.baseProviderConfig.viteStartupDelay));

    // Debug: check for running Vite processes
    const psResult = await this.sandbox.runCommand('ps aux | grep vite | head -5');
    if (psResult.stdout) {
      console.log('[ComputeProvider] restartViteServer ps stdout:', String(psResult.stdout).substring(0, 500));
    }

    // Check Vite log for errors
    const logResult = await this.sandbox.runCommand(`tail -20 ${WORKING_DIR}/vite.log`);
    if (logResult.stdout) {
      console.log('[ComputeProvider] restartViteServer vite.log:', String(logResult.stdout).substring(0, 1000));
    }

    const durationMs = Date.now() - start;
    console.log('[ComputeProvider] restartViteServer done, durationMs=', durationMs);
  }

  getSandboxUrl(): string | null {
    return this.sandboxInfo?.url || null;
  }

  getSandboxInfo(): SandboxInfo | null {
    return this.sandboxInfo;
  }

  async getE2BPreviewUrl(port: number = appConfig.baseProviderConfig.vitePort): Promise<string | null> {
    if (!this.sandbox || typeof (this.sandbox as any).getUrl !== 'function') {
      return null;
    }

    try {
      const url = await (this.sandbox as any).getUrl({ port });
      console.log('[ComputeProvider] getE2BPreviewUrl:', port, url);
      return typeof url === 'string' ? url : null;
    } catch (e) {
      console.log('[ComputeProvider] getE2BPreviewUrl failed for port', port, e);
      return null;
    }
  }

  async terminate(): Promise<void> {
    console.log('[ComputeProvider] terminate() called, sandboxId:', this.sandboxInfo?.sandboxId);
    
    // Destroy the E2B sandbox (which hosts the Compute sandbox)
    if (this.sandbox) {
      try {
        console.log('[ComputeProvider] Destroying E2B sandbox...');
        await this.sandbox.destroy();
        console.log('[ComputeProvider] E2B sandbox destroyed successfully');
      } catch (e) {
        console.error('[ComputeProvider] Failed to destroy E2B sandbox:', e);
      }
    }
    
    this.sandbox = null;
    this.sandboxInfo = null;
    console.log('[ComputeProvider] terminate() complete, all references cleared');
  }

  isAlive(): boolean {
    return !!this.sandbox;
  }
}