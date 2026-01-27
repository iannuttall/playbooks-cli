export type { InstallMode } from './installer/install.js';
export {
  installSkillForAgent,
  installMintlifySkillForAgent,
  installRemoteSkillForAgent,
  isSkillInstalled,
} from './installer/install.js';
export { copySkillDirectory } from './installer/files.js';
export { getInstallPath, getCanonicalPath, getCanonicalSkillsBase } from './installer/paths.js';
