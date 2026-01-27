import { homedir } from 'node:os';

/**
 * Shortens a path for display: replaces homedir with ~ and cwd with .
 */
export function shortenPath(fullPath: string, cwd: string): string {
  const home = homedir();
  if (fullPath.startsWith(home)) {
    return fullPath.replace(home, '~');
  }
  if (fullPath.startsWith(cwd)) {
    return `.${fullPath.slice(cwd.length)}`;
  }
  return fullPath;
}

/**
 * Formats a list of items, truncating if too many.
 */
export function formatList(items: string[], maxShow = 5): string {
  if (items.length <= maxShow) {
    return items.join(', ');
  }
  const shown = items.slice(0, maxShow);
  const remaining = items.length - maxShow;
  return `${shown.join(', ')} +${remaining} more`;
}
