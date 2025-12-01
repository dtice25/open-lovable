import { SandboxProvider } from './types';
import { SandboxFactory } from './factory';

interface SandboxInfo {
  sandboxId: string;
  provider: SandboxProvider;
  createdAt: Date;
  lastAccessed: Date;
}

class SandboxManager {
  private sandboxes: Map<string, SandboxInfo> = new Map();
  private activeSandboxId: string | null = null;
  private instanceId = `mgr-${Date.now()}`;

  constructor() {
    console.log(`[SandboxManager] Instance created: ${this.instanceId}`);
  }

  /**
   * Get or create a sandbox provider for the given sandbox ID
   */
  async getOrCreateProvider(sandboxId: string): Promise<SandboxProvider> {
    // Check if we already have this sandbox
    const existing = this.sandboxes.get(sandboxId);
    if (existing) {
      existing.lastAccessed = new Date();
      return existing.provider;
    }

    // Try to reconnect to existing sandbox
    
    try {
      const provider = SandboxFactory.create();
      
      // For E2B provider, try to reconnect
      if (provider.constructor.name === 'E2BProvider') {
        // E2B sandboxes can be reconnected using the sandbox ID
        const reconnected = await (provider as any).reconnect(sandboxId);
        if (reconnected) {
          this.sandboxes.set(sandboxId, {
            sandboxId,
            provider,
            createdAt: new Date(),
            lastAccessed: new Date()
          });
          this.activeSandboxId = sandboxId;
          return provider;
        }
      }
      
      // For Vercel or if reconnection failed, return the new provider
      // The caller will need to handle creating a new sandbox
      return provider;
    } catch (error) {
      console.error(`[SandboxManager] Error reconnecting to sandbox ${sandboxId}:`, error);
      throw error;
    }
  }

  /**
   * Register a new sandbox
   */
  registerSandbox(sandboxId: string, provider: SandboxProvider): void {
    console.log(`[SandboxManager][${this.instanceId}] registerSandbox called for: ${sandboxId}`);
    console.log(`[SandboxManager][${this.instanceId}] Before register - sandboxes count: ${this.sandboxes.size}, activeSandboxId: ${this.activeSandboxId}`);
    this.sandboxes.set(sandboxId, {
      sandboxId,
      provider,
      createdAt: new Date(),
      lastAccessed: new Date()
    });
    this.activeSandboxId = sandboxId;
    console.log(`[SandboxManager][${this.instanceId}] After register - sandboxes count: ${this.sandboxes.size}, activeSandboxId: ${this.activeSandboxId}`);
    console.log(`[SandboxManager][${this.instanceId}] Sandbox IDs in map: ${Array.from(this.sandboxes.keys()).join(', ')}`);
  }

  /**
   * Get the active sandbox provider
   */
  getActiveProvider(): SandboxProvider | null {
    console.log(`[SandboxManager][${this.instanceId}] getActiveProvider called`);
    console.log(`[SandboxManager][${this.instanceId}] activeSandboxId: ${this.activeSandboxId}, sandboxes count: ${this.sandboxes.size}`);
    console.log(`[SandboxManager][${this.instanceId}] Sandbox IDs in map: ${Array.from(this.sandboxes.keys()).join(', ') || '(empty)'}`);
    
    if (!this.activeSandboxId) {
      console.log(`[SandboxManager][${this.instanceId}] No activeSandboxId set, returning null`);
      return null;
    }
    
    const sandbox = this.sandboxes.get(this.activeSandboxId);
    if (sandbox) {
      sandbox.lastAccessed = new Date();
      console.log(`[SandboxManager][${this.instanceId}] Found active provider for ${this.activeSandboxId}`);
      return sandbox.provider;
    }
    
    console.log(`[SandboxManager][${this.instanceId}] activeSandboxId ${this.activeSandboxId} not found in map!`);
    return null;
  }

  /**
   * Get a specific sandbox provider
   */
  getProvider(sandboxId: string): SandboxProvider | null {
    console.log(`[SandboxManager][${this.instanceId}] getProvider called for: ${sandboxId}`);
    console.log(`[SandboxManager][${this.instanceId}] sandboxes count: ${this.sandboxes.size}`);
    console.log(`[SandboxManager][${this.instanceId}] Sandbox IDs in map: ${Array.from(this.sandboxes.keys()).join(', ') || '(empty)'}`);
    
    const sandbox = this.sandboxes.get(sandboxId);
    if (sandbox) {
      sandbox.lastAccessed = new Date();
      console.log(`[SandboxManager][${this.instanceId}] Found provider for ${sandboxId}`);
      return sandbox.provider;
    }
    console.log(`[SandboxManager][${this.instanceId}] No provider found for ${sandboxId}`);
    return null;
  }

  /**
   * Set the active sandbox
   */
  setActiveSandbox(sandboxId: string): boolean {
    if (this.sandboxes.has(sandboxId)) {
      this.activeSandboxId = sandboxId;
      return true;
    }
    return false;
  }

  /**
   * Terminate a sandbox
   */
  async terminateSandbox(sandboxId: string): Promise<void> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (sandbox) {
      try {
        await sandbox.provider.terminate();
      } catch (error) {
        console.error(`[SandboxManager] Error terminating sandbox ${sandboxId}:`, error);
      }
      this.sandboxes.delete(sandboxId);
      
      if (this.activeSandboxId === sandboxId) {
        this.activeSandboxId = null;
      }
    }
  }

  /**
   * Terminate all sandboxes
   */
  async terminateAll(): Promise<void> {
    const promises = Array.from(this.sandboxes.values()).map(sandbox => 
      sandbox.provider.terminate().catch(err => 
        console.error(`[SandboxManager] Error terminating sandbox ${sandbox.sandboxId}:`, err)
      )
    );
    
    await Promise.all(promises);
    this.sandboxes.clear();
    this.activeSandboxId = null;
  }

  /**
   * Clean up old sandboxes (older than maxAge milliseconds)
   */
  async cleanup(maxAge: number = 3600000): Promise<void> {
    const now = new Date();
    const toDelete: string[] = [];
    
    for (const [id, info] of this.sandboxes.entries()) {
      const age = now.getTime() - info.lastAccessed.getTime();
      if (age > maxAge) {
        toDelete.push(id);
      }
    }
    
    for (const id of toDelete) {
      await this.terminateSandbox(id);
    }
  }
}

// Export singleton instance
export const sandboxManager = new SandboxManager();

// Also maintain backward compatibility with global state
declare global {
  var sandboxManager: SandboxManager;
}

// Ensure the global reference points to our singleton
global.sandboxManager = sandboxManager;