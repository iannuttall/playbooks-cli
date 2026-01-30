import type { UrlMarkdownResult } from '../playbooks-api.js';

export type UrlMarkdownOutput =
  | {
      status: 'success';
      json: boolean;
      data: UrlMarkdownResult;
    }
  | {
      status: 'error';
      message: string;
    };

let output: UrlMarkdownOutput | null = null;

export function setUrlMarkdownOutput(next: UrlMarkdownOutput) {
  output = next;
}

export function consumeUrlMarkdownOutput(): UrlMarkdownOutput | null {
  const current = output;
  output = null;
  return current;
}
