export class SearchQueryDto {
  q?: string;
  type?: string;
  workspaceId?: string;
  authorId?: string;
  /** ISO 8601 date — only return documents created at or after this instant. */
  from?: string;
  /** ISO 8601 date — only return documents created at or before this instant. */
  to?: string;
  limit?: number;
  offset?: number;
}
