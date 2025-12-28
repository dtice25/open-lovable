import { SandboxProvider, SandboxProviderConfig } from './types';
import { E2BProvider } from './providers/e2b-provider';
import { VercelProvider } from './providers/vercel-provider';
import { DaytonaProvider } from './providers/daytona-provider';
import { ModalProvider } from './providers/modal-provider';
import { ComputeProvider } from './providers/compute-provider';

export class SandboxFactory {
  static create(provider?: string, config?: SandboxProviderConfig): SandboxProvider {
    // Use environment variable if provider not specified
    const selectedProvider = provider || process.env.SANDBOX_PROVIDER || 'e2b';
    
    
    switch (selectedProvider.toLowerCase()) {
      case 'e2b':
        return new E2BProvider(config || {});
      
      case 'vercel':
        return new VercelProvider(config || {});

      case 'daytona':
        return new DaytonaProvider(config || {});
        
      case 'modal':
        return new ModalProvider(config || {});

      case 'compute':
        return new ComputeProvider(config || {});
      
      default:
        throw new Error(`Unknown sandbox provider: ${selectedProvider}. Supported providers: e2b, vercel, daytona, modal, compute`);
    }
  }
  
  static getAvailableProviders(): string[] {
    return ['e2b', 'vercel', 'daytona', 'modal', 'compute'];
  }
  
  static isProviderAvailable(provider: string): boolean {
    switch (provider.toLowerCase()) {
      case 'e2b':
        return !!process.env.E2B_API_KEY;
      
      case 'vercel':
        // Vercel can use OIDC (automatic) or PAT
        return !!process.env.VERCEL_OIDC_TOKEN || 
               (!!process.env.VERCEL_TOKEN && !!process.env.VERCEL_TEAM_ID && !!process.env.VERCEL_PROJECT_ID);

      case 'daytona':
        return !!process.env.DAYTONA_API_KEY;

      case 'modal':
        return (!!process.env.MODAL_TOKEN_ID && !!process.env.MODAL_TOKEN_SECRET);

      case 'compute':
        return !!process.env.COMPUTESDK_API_KEY;
      
      default:
        return false;
    }
  }
}