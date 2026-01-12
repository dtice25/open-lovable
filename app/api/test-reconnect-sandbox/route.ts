import { NextRequest, NextResponse } from 'next/server';
import { ComputeSandbox } from '@/lib/sandbox/providers/compute-client';

declare global {
  var testComputeSandbox: ComputeSandbox | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sandboxId } = body;

    if (!sandboxId) {
      return NextResponse.json({
        success: false,
        error: 'sandboxId is required',
      }, { status: 400 });
    }

    console.log(`[test-reconnect-sandbox] Testing reconnection to sandbox: ${sandboxId}`);

    const helper = new ComputeSandbox();
    await helper.getAndClearSandbox(sandboxId);

    // Update global reference
    global.testComputeSandbox = helper;

    console.log('[test-reconnect-sandbox] Reconnection test completed successfully');

    return NextResponse.json({
      success: true,
      message: 'Successfully reconnected to sandbox and cleared /app directory',
      sandboxId,
    });
  } catch (error) {
    console.error('[test-reconnect-sandbox] Error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message,
    }, { status: 500 });
  }
}
