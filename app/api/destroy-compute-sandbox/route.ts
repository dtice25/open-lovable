import { NextResponse } from 'next/server';
import { ComputeSandbox } from '@/lib/sandbox/providers/compute-client';

declare global {
  var testComputeSandbox: ComputeSandbox | null;
}

export async function POST() {
  try {
    if (!global.testComputeSandbox) {
      console.log('[destroy-compute-sandbox] No sandbox to destroy');
      return NextResponse.json({
        success: false,
        message: 'No sandbox exists to destroy',
      }, { status: 400 });
    }

    console.log('[destroy-compute-sandbox] Destroying sandbox...');
    await global.testComputeSandbox.destroySandbox();
    global.testComputeSandbox = null;
    console.log('[destroy-compute-sandbox] Sandbox destroyed successfully');

    return NextResponse.json({
      success: true,
      message: 'Sandbox destroyed successfully',
    });
  } catch (error) {
    console.error('[destroy-compute-sandbox] Error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message,
    }, { status: 500 });
  }
}
