// Export types
export type { HostProvider, ProviderMatch, ProviderRegistry, RemoteSkill } from './types.js';

// Export registry functions
export { registry, registerProvider, findProvider, getProviders } from './registry.js';

// Export individual providers
export { MintlifyProvider, mintlifyProvider } from './mintlify.js';
export { HuggingFaceProvider, huggingFaceProvider } from './huggingface.js';
export { RawSkillProvider, rawSkillProvider } from './raw.js';

import { huggingFaceProvider } from './huggingface.js';
import { mintlifyProvider } from './mintlify.js';
import { rawSkillProvider } from './raw.js';
// Register all built-in providers
import { registerProvider } from './registry.js';

registerProvider(mintlifyProvider);
registerProvider(huggingFaceProvider);
registerProvider(rawSkillProvider);
