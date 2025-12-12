import { NextResponse } from 'next/server';
import { ComputeSandbox } from '@/lib/sandbox/providers/compute-client';

export async function POST() {
  try {
    const helper = new ComputeSandbox();

    console.log('[test-compute-client] Creating sandbox and running ComputeClient...');
    await helper.createSandboxAndTest();
    console.log('[test-compute-client] Completed ComputeClient test.');

    return NextResponse.json({
      success: true,
      message: 'Created E2B sandbox and ran ComputeClient. Check server logs for details.',
    });
  } catch (error) {
    console.error('[test-compute-client] Error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message,
    }, { status: 500 });
  }
}
