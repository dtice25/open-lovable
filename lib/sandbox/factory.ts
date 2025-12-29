import { SandboxProvider, SandboxProviderConfig } from './types';
import { ComputeProvider } from './providers/compute-provider';

export class SandboxFactory {
  static create(config?: SandboxProviderConfig): SandboxProvider {
    return new ComputeProvider(config || {});
  }

  static isProviderAvailable(): boolean {
    return !!process.env.COMPUTESDK_API_KEY;
  }
}