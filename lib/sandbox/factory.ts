import { SandboxProvider } from './types';
import { ComputeProvider } from './providers/compute-provider';

export class SandboxFactory {
  static create(): SandboxProvider {
    return new ComputeProvider();
  }

  static isProviderAvailable(): boolean {
    return !!process.env.COMPUTESDK_API_KEY;
  }
}