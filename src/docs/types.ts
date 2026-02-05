export type DocSourceType = 'github' | 'web';
export type DocMode = 'docs' | 'repo';

export interface DocSource {
  name: string;
  type: DocSourceType;
  url: string;
  docs?: string;
  ref?: string;
  version?: string;
  mode?: DocMode;
  allow?: string[];
  deny?: string[];
  depth?: number;
  pages?: number;
}

export type DocInstallStatus = 'installed' | 'skipped' | 'failed';

export interface DocInstallResult {
  source: DocSource;
  slug: string;
  path: string;
  status: DocInstallStatus;
  message?: string;
}

export type DocUpdateStatus = 'updated' | 'skipped' | 'failed';

export interface DocUpdateResult {
  name: string;
  path: string;
  status: DocUpdateStatus;
  message?: string;
}

export interface DocUpdateSummary {
  total: number;
  updated: DocUpdateResult[];
  skipped: DocUpdateResult[];
  failed: DocUpdateResult[];
}
