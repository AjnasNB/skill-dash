export interface CatalogSkill {
  id: string; name: string; description: string; category: string; tags: string[];
  repo: string; owner: string; stars: number; official: boolean; featured: boolean;
  license: string; licensePath: string; revision: string; path: string; sourceUrl: string;
  checkedAt: string; updatedAt: string; fileCount: number; bytes: number; sha256: string; historical?: boolean;
}
export interface SkillFile { path: string; sourcePath: string; bytes: number; sha256: string; url: string; mode?: number }
export interface SkillManifest { schemaVersion: number; skill: CatalogSkill; files: SkillFile[]; archiveSha256?: string }
export interface InstallOptions {
  agent?: 'codex' | 'claude' | 'delta'; global?: boolean; cwd?: string; home?: string;
  platform?: string; appData?: string; deltaHome?: string; force?: boolean; dryRun?: boolean;
  fetcher?: typeof fetch;
}
export interface InstallResult { id: string; name: string; agent: string; root: string; destination: string; revision: string; files: number; bytes: number; status?: string }
export function safeRelative(value: unknown): boolean;
export function assertNoLinks(target: string): Promise<void>;
export function targetRoot(agent: string, options?: InstallOptions): string;
export function planInstall(skill: CatalogSkill, options?: InstallOptions): InstallResult;
export function validateManifest(manifest: unknown): asserts manifest is SkillManifest;
export function fetchVerifiedFile(file: SkillFile, fetcher?: typeof fetch): Promise<Buffer>;
export function installSkill(manifest: SkillManifest, options?: InstallOptions): Promise<InstallResult>;
export function installDiscovery(text: string, options?: InstallOptions): Promise<InstallResult>;
export function listInstalled(options?: InstallOptions): Promise<{ id: string; revision: string; installedAt: string; path: string }[]>;
