import { NextResponse } from 'next/server';
import { SandboxFactory } from '@/lib/sandbox/factory';
// SandboxProvider type is used through SandboxFactory
import type { SandboxState } from '@/types/sandbox';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';

// Store active sandbox globally
declare global {
  var activeSandboxProvider: any;
  var sandboxData: any;
  var existingFiles: Set<string>;
  var sandboxState: SandboxState;
}

// Generate unique request ID for tracing
let requestCounter = 0;

export async function POST() {
  const reqId = `create-${++requestCounter}-${Date.now()}`;
  try {
    console.log(`[create-ai-sandbox-v2][${reqId}] === STARTING SANDBOX CREATION ===`);
    console.log(`[create-ai-sandbox-v2][${reqId}] global.activeSandboxProvider exists: ${!!global.activeSandboxProvider}`);
    console.log(`[create-ai-sandbox-v2][${reqId}] global.sandboxData: ${JSON.stringify(global.sandboxData || null)}`);
    
    // Clean up all existing sandboxes
    console.log(`[create-ai-sandbox-v2][${reqId}] Cleaning up existing sandboxes...`);
    await sandboxManager.terminateAll();
    console.log(`[create-ai-sandbox-v2][${reqId}] After terminateAll - global.activeSandboxProvider: ${!!global.activeSandboxProvider}`);
    
    // Also clean up legacy global state
    if (global.activeSandboxProvider) {
      console.log(`[create-ai-sandbox-v2][${reqId}] Terminating legacy global sandbox...`);
      try {
        await global.activeSandboxProvider.terminate();
      } catch (e) {
        console.error(`[create-ai-sandbox-v2][${reqId}] Failed to terminate legacy global sandbox:`, e);
      }
      global.activeSandboxProvider = null;
      console.log(`[create-ai-sandbox-v2][${reqId}] Set global.activeSandboxProvider = null`);
    }
    
    // Clear existing files tracking
    if (global.existingFiles) {
      global.existingFiles.clear();
    } else {
      global.existingFiles = new Set<string>();
    }

    // Create new sandbox using factory
    console.log(`[create-ai-sandbox-v2][${reqId}] Creating provider via SandboxFactory...`);
    const provider = SandboxFactory.create();
    console.log(`[create-ai-sandbox-v2][${reqId}] Provider created, now creating sandbox...`);
    const sandboxInfo = await provider.createSandbox();
    console.log(`[create-ai-sandbox-v2][${reqId}] Sandbox created with ID: ${sandboxInfo.sandboxId}`);
    
    console.log(`[create-ai-sandbox-v2][${reqId}] Setting up Vite React app...`);
    await provider.setupViteApp();
    console.log(`[create-ai-sandbox-v2][${reqId}] Vite setup complete`);
    
    // Register with sandbox manager
    console.log(`[create-ai-sandbox-v2][${reqId}] Registering sandbox ${sandboxInfo.sandboxId} with sandboxManager...`);
    sandboxManager.registerSandbox(sandboxInfo.sandboxId, provider);
    
    // Also store in legacy global state for backward compatibility
    console.log(`[create-ai-sandbox-v2][${reqId}] Setting global.activeSandboxProvider...`);
    global.activeSandboxProvider = provider;
    console.log(`[create-ai-sandbox-v2][${reqId}] global.activeSandboxProvider set: ${!!global.activeSandboxProvider}`);
    global.sandboxData = {
      sandboxId: sandboxInfo.sandboxId,
      url: sandboxInfo.url
    };
    
    // Initialize sandbox state
    global.sandboxState = {
      fileCache: {
        files: {},
        lastSync: Date.now(),
        sandboxId: sandboxInfo.sandboxId
      },
      sandbox: provider, // Store the provider instead of raw sandbox
      sandboxData: {
        sandboxId: sandboxInfo.sandboxId,
        url: sandboxInfo.url
      }
    };
    
    console.log(`[create-ai-sandbox-v2][${reqId}] === SANDBOX CREATION COMPLETE ===`);
    console.log(`[create-ai-sandbox-v2][${reqId}] Sandbox ID: ${sandboxInfo.sandboxId}`);
    console.log(`[create-ai-sandbox-v2][${reqId}] URL: ${sandboxInfo.url}`);
    console.log(`[create-ai-sandbox-v2][${reqId}] global.activeSandboxProvider: ${!!global.activeSandboxProvider}`);
    console.log(`[create-ai-sandbox-v2][${reqId}] global.sandboxData: ${JSON.stringify(global.sandboxData)}`);
    
    return NextResponse.json({
      success: true,
      sandboxId: sandboxInfo.sandboxId,
      url: sandboxInfo.url,
      provider: sandboxInfo.provider,
      message: 'Sandbox created and Vite React app initialized'
    });

  } catch (error) {
    console.error('[create-ai-sandbox-v2] Error:', error);
    
    // Clean up on error
    await sandboxManager.terminateAll();
    if (global.activeSandboxProvider) {
      try {
        await global.activeSandboxProvider.terminate();
      } catch (e) {
        console.error('Failed to terminate sandbox on error:', e);
      }
      global.activeSandboxProvider = null;
    }
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to create sandbox',
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}