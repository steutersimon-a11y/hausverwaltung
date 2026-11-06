import type { ImportFormat, ImportIssue, ImportProperty } from './imports';

export interface ImportBatchDto {
  id: string;
  sourceSystem: string;
  dataClass: 'synthetic' | 'real';
  format: ImportFormat;
  originalName: string;
  status: 'review' | 'imported';
  revision: number;
  createdAt: string;
  importedAt: string | null;
  recordCount: number;
  sourceUrl: string;
  report: Record<string, unknown> | null;
}
export interface ImportRecordDto {
  id: string;
  sourceLine: number;
  revision: number;
  included: boolean;
  confirmed: boolean;
  data: ImportProperty;
  issues: ImportIssue[];
  change: {
    kind: 'new' | 'unchanged' | 'conflict' | 'invalid' | 'excluded';
    existingPropertyId: string | null;
    fields: { field: string; before: unknown; after: unknown }[];
  };
}
export interface ImportReviewDto {
  batch: ImportBatchDto;
  records: ImportRecordDto[];
  summary: { total: number; new: number; unchanged: number; conflict: number; invalid: number; excluded: number; warning: number; unconfirmed: number };
}
