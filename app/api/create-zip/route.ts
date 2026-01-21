import { NextResponse } from 'next/server';

declare global {
  var activeSandboxProvider: any;
}

export async function POST() {
  try {
    if (!global.activeSandboxProvider) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox' 
      }, { status: 400 });
    }
    
    const sandbox = global.activeSandboxProvider;
    
    console.log('[create-zip] Creating project tarball...');
    
    // Create tar.gz file in sandbox using tar (universally available)
    const tarResult = await sandbox.runCommand(
      'tar -czf /tmp/project.tar.gz --exclude=node_modules --exclude=.git --exclude=.next --exclude=dist --exclude=build --exclude="*.log" -C app .'
    );
    
    if (tarResult.exitCode !== 0) {
      const error = tarResult.stderr;
      throw new Error(`Failed to create tarball: ${error}`);
    }
    
    const sizeResult = await sandbox.runCommand(
      "ls -la /tmp/project.tar.gz | awk '{print $5}'"
    );
    
    const fileSize = sizeResult.stdout;
    console.log(`[create-zip] Created project.tar.gz (${fileSize.trim()} bytes)`);
    
    // Read the tar file and convert to base64
    const readResult = await sandbox.runCommand(
      'base64 /tmp/project.tar.gz'
    );
    
    if (readResult.exitCode !== 0) {
      const error = readResult.stderr;
      throw new Error(`Failed to read tarball: ${error}`);
    }
    
    const base64Content = readResult.stdout.trim();
    
    // Create a data URL for download
    const dataUrl = `data:application/gzip;base64,${base64Content}`;
    
    return NextResponse.json({
      success: true,
      dataUrl,
      fileName: 'sandbox-project.tar.gz',
      message: 'Tarball created successfully'
    });
    
  } catch (error) {
    console.error('[create-zip] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: (error as Error).message 
      }, 
      { status: 500 }
    );
  }
}