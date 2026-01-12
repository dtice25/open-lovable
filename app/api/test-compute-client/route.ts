import { NextResponse } from 'next/server';
import { ComputeSandbox } from '@/lib/sandbox/providers/compute-client';

// Store the sandbox instance globally so we can destroy it later
declare global {
  var testComputeSandbox: ComputeSandbox | null;
}

export async function POST() {
  try {
    // Clean up any existing sandbox first
    if (global.testComputeSandbox) {
      console.log('[test-compute-client] Cleaning up existing sandbox...');
      await global.testComputeSandbox.destroySandbox();
    }

    const helper = new ComputeSandbox();
    global.testComputeSandbox = helper;

    console.log('[test-compute-client] Creating sandbox and running ComputeClient...');
    await helper.createSandboxAndTest();
    console.log('[test-compute-client] Completed ComputeClient test.');

    const sandboxId = helper.getSandboxId();

    return NextResponse.json({
      success: true,
      message: 'Created E2B sandbox and ran ComputeClient. Check server logs for details.',
      sandboxId,
    });
  } catch (error) {
    console.error('[test-compute-client] Error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message,
    }, { status: 500 });
  }
}
