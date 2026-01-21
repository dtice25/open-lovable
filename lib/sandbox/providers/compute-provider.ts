import { compute } from 'computesdk';
import { SandboxProvider, SandboxInfo, CommandResult } from '../types';
import appConfig from '@/config/app.config';

export class ComputeProvider extends SandboxProvider {

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

      this.sandbox = await compute.sandbox.create();

      const sandboxId = this.sandbox.sandboxId;

      // Make sure ComputeSDK daemon is ready
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get preview URL for Vite port - no token needed
      const previewUrl = await this.sandbox.getUrl({ port: appConfig.baseProviderConfig.vitePort });

      this.sandboxInfo = {
        sandboxId,
        url: previewUrl,
        provider: 'compute',
        createdAt: new Date(),
      };

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

    // Normalize path to include app/ prefix
    const fullPath = path.startsWith('app/') ? path : `app/${path}`;

    const start = Date.now();

    // Ensure parent directory exists
    const dirPath = fullPath.includes('/')
      ? fullPath.substring(0, fullPath.lastIndexOf('/'))
      : '';
    if (dirPath) {
      await this.runCommand(`mkdir -p ${dirPath}`);
    }

    await this.sandbox.filesystem.writeFile(fullPath, content);
  }

  async readFile(path: string): Promise<string> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    // Normalize path to include app/ prefix
    const fullPath = path.startsWith('app/') ? path : `app/${path}`;

    // Use cat command instead of sandbox.readFile to avoid timeout issues
    const result = await this.runCommand(`cat ${fullPath}`);
    if (!result.success) {
      throw new Error(`Failed to read file ${fullPath}: ${result.stderr || 'File not found'}`);
    }
    return result.stdout;
  }

  async listFiles(directory: string = 'app'): Promise<string[]> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const result = await this.runCommand(`ls -1 ${directory}`);
    if (!result.success || !result.stdout) {
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
      ? `cd app && npm install ${flags} ${pkgList}`
      : `cd app && npm install ${pkgList}`;

    const start = Date.now();

    const result = await this.runCommand(command);

    if (appConfig.packages.autoRestartVite && result.success) {
      await this.restartViteServer();
    }

    return result;
  }

  async setupViteApp(): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    // Create basic directory structure
    await this.runCommand('mkdir -p app/src');

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

    await this.sandbox.filesystem.writeFile('app/package.json', JSON.stringify(packageJson, null, 2));

    const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: ${appConfig.baseProviderConfig.vitePort},
    strictPort: true,
    hmr: false,
    allowedHosts: ['localhost', '127.0.0.1', '.computesdk.com'],
  },
})
`;
    await this.sandbox.filesystem.writeFile('app/vite.config.js', viteConfig);

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
    await this.sandbox.filesystem.writeFile('app/tailwind.config.js', tailwindConfig);

    const postcssConfig = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`;
    await this.sandbox.filesystem.writeFile('app/postcss.config.js', postcssConfig);

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
    await this.sandbox.filesystem.writeFile('app/index.html', indexHtml);

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
    await this.sandbox.filesystem.writeFile('app/src/main.jsx', mainJsx);

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
    await this.sandbox.filesystem.writeFile('app/src/App.jsx', appJsx);

    const indexCss = `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background-color: rgb(17 24 39);
}
`;
    await this.sandbox.filesystem.writeFile('app/src/index.css', indexCss);

    const flags = appConfig.packages.useLegacyPeerDeps ? '--legacy-peer-deps' : '';
    const installCommand = flags
      ? `cd app && npm install ${flags}`
      : `cd app && npm install`;

    await this.runCommand(installCommand);
    
    await this.restartViteServer();
  }

  async restartViteServer(): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }
    const start = Date.now();

    // Kill existing Vite process
    await this.runCommand('pkill -f vite || true');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Start Vite dev server in background
    this.sandbox.runCommand('npm run dev', {
      cwd: 'app',
      background: true,
    });

    await new Promise(resolve => setTimeout(resolve, appConfig.baseProviderConfig.viteStartupDelay));
  }

  getSandboxUrl(): string | null {
    return this.sandboxInfo?.url || null;
  }

  getSandboxInfo(): SandboxInfo | null {
    return this.sandboxInfo;
  }

  async terminate(): Promise<void> {
    // Destroy the sandbox
    if (this.sandbox) {
      try {
        await this.sandbox.destroy();
      } catch (e) {
        console.error('[ComputeProvider] Failed to destroy sandbox:', e);
      }
    }
    
    this.sandbox = null;
    this.sandboxInfo = null;
  }

  isAlive(): boolean {
    return !!this.sandbox;
  }
}