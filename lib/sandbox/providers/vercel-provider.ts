import { createCompute } from 'computesdk';
import { vercel } from '@computesdk/vercel';
import { SandboxProvider, SandboxInfo, CommandResult } from '../types';
// SandboxProviderConfig available through parent class
import { appConfig } from '@/config/app.config';

export class VercelProvider extends SandboxProvider {
  private existingFiles: Set<string> = new Set();

  // Create compute instance with Vercel provider
  private compute = createCompute({
    provider: vercel({
      token: process.env.VERCEL_TOKEN || process.env.VERCEL_OIDC_TOKEN,
      teamId: process.env.VERCEL_TEAM_ID,
      projectId: process.env.VERCEL_PROJECT_ID,
      timeout: appConfig.baseProviderConfig.timeoutMs,
      runtime: 'node',
      ports: [appConfig.baseProviderConfig.vitePort],
    }),
  });

  async createSandbox(): Promise<SandboxInfo> {
    try {
      // Destroy existing sandbox if any
      if (this.sandbox) {
        try {
          await this.compute.sandbox.destroy(this.sandbox.sandboxId);
        } catch (e) {
          console.error('[VercelProvider] Failed to destroy existing sandbox:', e);
        }
        this.sandbox = null;
      }

      // Clear existing files tracking
      this.existingFiles.clear();

      // Create sandbox via ComputeSDK Vercel provider
      this.sandbox = await this.compute.sandbox.create();

      const sandboxId = this.sandbox.sandboxId;

      // Get preview URL for Vite port
      const previewUrl = await this.sandbox.getUrl({ port: appConfig.baseProviderConfig.vitePort });

      this.sandboxInfo = {
        sandboxId,
        url: previewUrl,
        provider: 'vercel',
        createdAt: new Date()
      };

      return this.sandboxInfo;

    } catch (error) {
      console.error('[VercelProvider] Error creating sandbox:', error);
      throw error;
    }
  }

  async runCommand(command: string): Promise<CommandResult> {

    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    try {
      // Parse command into cmd and args
      const parts = command.split(' ').filter(Boolean);
      const cmd = parts[0];
      const args = parts.slice(1);

      // ComputeSDK uses runCommand(cmd, args, options)
      const result = await this.sandbox.runCommand(cmd, args, {
        cwd: appConfig.baseProviderConfig.vercel.workingDirectory,
      });

      return {
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.exitCode || 0,
        success: result.exitCode === 0
      };
    } catch (error: any) {
      console.error('[VercelProvider] runCommand error:', error);
      return {
        stdout: '',
        stderr: error.message || 'Command failed',
        exitCode: 1,
        success: false
      };
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const fullPath = path.startsWith('/') ? path : `${appConfig.baseProviderConfig.vercel.workingDirectory}/${path}`;

    // Ensure directory exists
    const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (dirPath) {
      try {
        await this.sandbox.filesystem.mkdir(dirPath);
      } catch {
        // Directory may already exist or filesystem.mkdir may not be available
        await this.sandbox.runCommand('mkdir', ['-p', dirPath]);
      }
    }

    // Use base64 encoding to avoid escaping issues with Vercel's filesystem implementation
    try {
      const base64Content = Buffer.from(content, 'utf-8').toString('base64');
      const result = await this.sandbox.runCommand('sh', [
        '-c',
        `echo '${base64Content}' | base64 -d > '${fullPath}'`,
      ]);

      if (result.exitCode !== 0) {
        throw new Error(`Failed to write file: ${result.stderr}`);
      }

      this.existingFiles.add(path);
    } catch (error) {
      console.error('[VercelProvider] writeFile error:', error);
      throw error;
    }
  }

  async readFile(path: string): Promise<string> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const fullPath = path.startsWith('/') ? path : `${appConfig.baseProviderConfig.vercel.workingDirectory}/${path}`;

    const result = await this.sandbox.runCommand('sh', ['-c', `cat '${fullPath}'`]);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file: ${result.stderr}`);
    }

    const content = result.stdout || '';
    return content;
  }

  async listFiles(directory?: string): Promise<string[]> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const dir = directory || appConfig.baseProviderConfig.vercel.workingDirectory;

    const result = await this.sandbox.runCommand('sh', [
      '-c',
      `find ${dir} -type f ` +
        `-not -path "*/node_modules/*" ` +
        `-not -path "*/.git/*" ` +
        `-not -path "*/.next/*" ` +
        `-not -path "*/dist/*" ` +
        `-not -path "*/build/*" | sed "s|^${dir}/||"`,
    ]);

    if (result.exitCode !== 0) {
      console.warn('[VercelProvider] listFiles failed:', result.stderr);
      return [];
    }

    const files = (result.stdout || '')
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line !== '');

    return files;
  }

  async installPackages(packages: string[]): Promise<CommandResult> {
if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const legacyFlag = appConfig.packages.useLegacyPeerDeps ? ['--legacy-peer-deps'] : [];
    const extraFlags = process.env.NPM_FLAGS ? process.env.NPM_FLAGS.split(' ') : [];
    const args = ['install', ...legacyFlag, ...extraFlags, ...packages];

    const result = await this.sandbox.runCommand('npm', args, {
      cwd: appConfig.baseProviderConfig.vercel.workingDirectory,
    });

    // Restart Vite if configured and successful
    if (result.exitCode === 0 && appConfig.packages.autoRestartVite) {
      await this.restartViteServer();
    }

    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: result.exitCode || 0,
      success: result.exitCode === 0
    };
  }

  async setupViteApp(): Promise<void> {
if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const cwd = appConfig.baseProviderConfig.vercel.workingDirectory;

    // Ensure src directory exists
    try {
      await this.sandbox.filesystem.mkdir(`${cwd}/src`);
    } catch {
      // Directory may already exist or filesystem.mkdir may not be available
      await this.sandbox.runCommand('mkdir', ['-p', `${cwd}/src`]);
    }

    // package.json
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
        autoprefixer: '^10.4.16',
      },
    };

    await this.writeFile('package.json', JSON.stringify(packageJson, null, 2));

    // vite.config.js
    const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: ${appConfig.baseProviderConfig.vitePort},
    strictPort: true,
    allowedHosts: [
      '.vercel.run',
      'localhost',
    ],
    hmr: {
      clientPort: 443,
      protocol: 'wss',
    },
  },
})`;

    await this.writeFile('vite.config.js', viteConfig);

    // tailwind.config.js
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
}`;

    await this.writeFile('tailwind.config.js', tailwindConfig);

    // postcss.config.js
    const postcssConfig = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`;

    await this.writeFile('postcss.config.js', postcssConfig);

    // index.html
    const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sandbox App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`;

    await this.writeFile('index.html', indexHtml);

    // src/main.jsx
    const mainJsx = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`;

    await this.writeFile('src/main.jsx', mainJsx);

    // src/App.jsx
    const appJsx = `function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="text-center max-w-2xl">
        <p className="text-lg text-gray-400">
          Vercel Sandbox Ready<br/>
          Start building your React app with Vite and Tailwind CSS!
        </p>
      </div>
    </div>
  )
}

export default App`;

    await this.writeFile('src/App.jsx', appJsx);

    // src/index.css
    const indexCss = `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background-color: rgb(17 24 39);
}`;

    await this.writeFile('src/index.css', indexCss);

    // Install dependencies
    const installResult = await this.sandbox.runCommand('npm', ['install'], {
      cwd,
    });

    if (installResult.exitCode === 0) {
    } else {
      console.warn('[VercelProvider] npm install had issues:', installResult.stderr);
    }

    // Start Vite dev server
    await this.restartViteServer();

    // Track initial files
    this.existingFiles.add('src/App.jsx');
    this.existingFiles.add('src/main.jsx');
    this.existingFiles.add('src/index.css');
    this.existingFiles.add('index.html');
    this.existingFiles.add('package.json');
    this.existingFiles.add('vite.config.js');
    this.existingFiles.add('tailwind.config.js');
    this.existingFiles.add('postcss.config.js');

  }

  async restartViteServer(): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const cwd = appConfig.baseProviderConfig.vercel.workingDirectory;

    // Kill existing Vite process
    try {
      await this.sandbox.runCommand('sh', ['-c', 'pkill -f vite || true']);
    } catch (e) {
      console.log('[VercelProvider] pkill error (ignored):', e);
    }

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Start Vite dev server in background
    try {
      await this.sandbox.runCommand('npm', ['run', 'dev'], {
        cwd,
        background: true,
      });
    } catch (e: any) {
      console.error('[VercelProvider] Failed to start Vite:', e.message);
    }

    // Wait for Vite to be ready
    await new Promise(resolve => setTimeout(resolve, appConfig.baseProviderConfig.viteStartupDelay));

  }

  getSandboxUrl(): string | null {
    return this.sandboxInfo?.url || null;
  }

  getSandboxInfo(): SandboxInfo | null {
    return this.sandboxInfo;
  }

  async terminate(): Promise<void> {
    if (this.sandbox && this.sandboxInfo?.sandboxId) {
      try {
        await this.compute.sandbox.destroy(this.sandboxInfo.sandboxId);
      } catch (e) {
        console.error('[VercelProvider] Failed to terminate sandbox:', e);
      }
      this.sandbox = null;
      this.sandboxInfo = null;
    }
  }

  isAlive(): boolean {
    const alive = !!this.sandbox;
    return alive;
  }
}