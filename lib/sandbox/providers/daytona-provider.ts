import { createCompute } from 'computesdk';
import { daytona } from '@computesdk/daytona';
import { SandboxProvider, SandboxInfo, CommandResult } from '../types';
import { appConfig } from '@/config/app.config';

export class DaytonaProvider extends SandboxProvider {
  private existingFiles: Set<string> = new Set();
  private workingDir: string | null = null;

  // Create compute instance with Daytona provider
  private compute = createCompute({
    provider: daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      runtime: 'node',
      timeout: appConfig.baseProviderConfig.timeoutMs,
    }),
  });

  // Uses appConfig.baseProviderConfig.daytona.workingDirectory as the single source of truth.
  private async ensureWorkingDir(): Promise<string> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    if (this.workingDir) {
      return this.workingDir;
    }

    if (appConfig.baseProviderConfig.daytona.workingDirectory) {
      this.workingDir = appConfig.baseProviderConfig.daytona.workingDirectory;
    } else {
      throw new Error(
        '[DaytonaProvider] Unable to determine working directory. ' +
          'appConfig.baseProviderConfig.daytona.workingDirectory is not set.',
      );
    }

    // At this point workingDir must be set or an error would have been thrown above
    return this.workingDir as string;
  }

  async createSandbox(): Promise<SandboxInfo> {
    try {
      // Destroy existing sandbox if any using ComputeSDK API
      if (this.sandbox) {
        try {
          await this.compute.sandbox.destroy(this.sandbox.sandboxId);
        } catch (e) {
          console.error('[DaytonaProvider] Failed to destroy existing sandbox:', e);
        }
        this.sandbox = null;
        this.workingDir = null;
      }

      // Clear existing files tracking
      this.existingFiles.clear();

      // Create sandbox via ComputeSDK Daytona provider
      this.sandbox = await this.compute.sandbox.create();

      const sandboxId = this.sandbox.sandboxId;

      // Get preview URL for Vite port
      const previewUrl = await this.sandbox.getUrl({ port: appConfig.baseProviderConfig.vitePort });

      this.sandboxInfo = {
        sandboxId,
        url: previewUrl,
        provider: 'daytona',
        createdAt: new Date(),
      };

      return this.sandboxInfo as SandboxInfo;
    } catch (error) {
      console.error('[DaytonaProvider] Error creating sandbox:', error);
      throw error;
    }
  }

  async runCommand(command: string): Promise<CommandResult> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const parts = command.split(' ').filter(Boolean);
    const cmd = parts[0];
    const args = parts.slice(1);
    const cwd = await this.ensureWorkingDir();

    try {
      const result = await this.sandbox.runCommand(cmd, args, { cwd });

      return {
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.exitCode || 0,
        success: result.exitCode === 0,
      };
    } catch (error: any) {
      return {
        stdout: '',
        stderr: error?.message || 'Command failed',
        exitCode: 1,
        success: false,
      };
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const cwd = await this.ensureWorkingDir();
    const fullPath = path.startsWith('/') ? path : `${cwd}/${path}`;

    // Ensure directory exists
    const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (dirPath) {
      try {
        if (this.sandbox.filesystem?.mkdir) {
          try {
            await this.sandbox.filesystem.mkdir(dirPath);
          } catch {
            // Directory may already exist
          }
        } else {
          await this.sandbox.runCommand('mkdir', ['-p', dirPath]);
        }
      } catch (e) {
        console.warn('[DaytonaProvider] Failed to ensure directory exists:', e);
      }
    }

    try {
      if (this.sandbox.filesystem?.writeFile) {
        await this.sandbox.filesystem.writeFile(fullPath, content);
      } else {
        // Fallback: write via shell redirection
        const escapedContent = content
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/\$/g, '\\$')
          .replace(/`/g, '\\`')
          .replace(/\n/g, '\\n');

        await this.sandbox.runCommand('sh', [
          '-c',
          `echo "${escapedContent}" > "${fullPath}"`,
        ]);
      }

      this.existingFiles.add(path);
    } catch (error) {
      console.error('[DaytonaProvider] Failed to write file:', error);
      throw error;
    }
  }

  async readFile(path: string): Promise<string> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const cwd = await this.ensureWorkingDir();
    const fullPath = path.startsWith('/') ? path : `${cwd}/${path}`;

    if (this.sandbox.filesystem?.readFile) {
      return await this.sandbox.filesystem.readFile(fullPath);
    }

    const result = await this.sandbox.runCommand('cat', [fullPath]);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file: ${result.stderr}`);
    }
    return result.stdout;
  }

  async listFiles(directory?: string): Promise<string[]> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const cwd = await this.ensureWorkingDir();
    const dir = directory || cwd;

    const result = await this.sandbox.runCommand('sh', [
      '-c',
      `cd ${dir} && find . -type f ` +
        `-not -path "*/node_modules/*" ` +
        `-not -path "*/.git/*" ` +
        `-not -path "*/.next/*" ` +
        `-not -path "*/dist/*" ` +
        `-not -path "*/build/*"`,
    ]);

    if (result.exitCode !== 0) {
      return [];
    }

    const raw = result.stdout || '';
    return raw
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => !!line)
      .map((line: string) => (line.startsWith('./') ? line.slice(2) : line));
  }

  async installPackages(packages: string[]): Promise<CommandResult> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const cwd = await this.ensureWorkingDir();
    const legacyFlag = appConfig.packages.useLegacyPeerDeps ? ['--legacy-peer-deps'] : [];
    const extraFlags = process.env.NPM_FLAGS ? process.env.NPM_FLAGS.split(' ') : [];

    const args = ['install', ...legacyFlag, ...extraFlags, ...packages];

    const result = await this.sandbox.runCommand('npm', args, { cwd });

    // Restart Vite if configured and successful
    if (result.exitCode === 0 && appConfig.packages.autoRestartVite) {
      await this.restartViteServer();
    }

    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: result.exitCode || 0,
      success: result.exitCode === 0,
    };
  }

  async setupViteApp(): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const cwd = await this.ensureWorkingDir();

    // Ensure src directory exists
    await this.sandbox.runCommand('mkdir', ['-p', `${cwd}/src`]);

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

    // vite.config.js - include Daytona preview domain from docs (*.proxy.daytona.work)
    const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: ${appConfig.baseProviderConfig.vitePort},
    strictPort: true,
    allowedHosts: [
      '.proxy.daytona.work',
      'localhost',
      '127.0.0.1',
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
)
`;

    await this.writeFile('src/main.jsx', mainJsx);

    // src/App.jsx
    const appJsx = `function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="text-center max-w-2xl">
        <p className="text-lg text-gray-400">
          Daytona Sandbox Ready<br/>
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
    await this.runCommand('npm install');

    // Start Vite dev server (robust background start)
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

    const cwd = await this.ensureWorkingDir();

    // Kill existing Vite process (ignore errors if none running)
    try {
      await this.sandbox.runCommand('sh', ['-c', 'pkill -f vite || true']);
    } catch {
      // ignore
    }

    // Start Vite dev server in background with nohup
    await this.sandbox.runCommand('sh', [
      '-c',
      `cd ${cwd} && nohup npm run dev > ${cwd}/vite.log 2>&1 &`,
    ]);

    // Wait for Vite to be ready
    await new Promise((resolve) => setTimeout(resolve, appConfig.baseProviderConfig.viteStartupDelay));
  }

  getSandboxUrl(): string | null {
    return this.sandboxInfo?.url || null;
  }

  getSandboxInfo(): SandboxInfo | null {
    return this.sandboxInfo;
  }

  async terminate(): Promise<void> {
    if (this.sandbox) {
      try {
        await this.compute.sandbox.destroy(this.sandbox.sandboxId);
      } catch (e) {
        console.error('[DaytonaProvider] Failed to terminate sandbox:', e);
      }
      this.sandbox = null;
      this.sandboxInfo = null;
      this.workingDir = null;
      this.existingFiles.clear();
    }
  }

  isAlive(): boolean {
    return !!this.sandbox;
  }
}

