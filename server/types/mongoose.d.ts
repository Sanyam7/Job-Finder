/**
 * What the shared Mongoose plugins add to every model and document.
 *
 * ★ Mongoose infers a model's type from its schema definition, which it can read statically.
 * It cannot see anything attached imperatively afterwards — `schema.statics.paginate`,
 * `schema.methods.softDelete`, the `deletedAt` path that `softDeletePlugin` calls
 * `schema.add()` with. So every `Model.paginate(...)` and every `doc.deletedAt` in the
 * codebase is an error under `checkJs`, which was the single largest source of noise in the
 * server typecheck.
 *
 * Declaring them here is not a suppression. `paginate` genuinely exists on every model,
 * because every schema in `src/models` applies `paginatePlugin` and `softDeletePlugin` — so
 * the augmentation states a fact about this codebase, and it means a typo'd option or a
 * misused return value is still caught.
 *
 * Per-model statics that are NOT universal (`Notification.push`, `Bookmark.findSavedIds`) are
 * deliberately declared on their own models rather than here, so this file stays true.
 */

import 'mongoose';

declare module 'mongoose' {
  /** The shape `paginatePlugin` resolves with. */
  interface PaginateResult<T = any> {
    items: T[];
    page: number;
    limit: number;
    totalItems: number;
  }

  /** The shape `paginateCursor` resolves with. */
  interface CursorPaginateResult<T = any> {
    items: T[];
    hasNextPage: boolean;
    nextCursor: string | null;
  }

  interface PaginateOptions {
    page?: number;
    limit?: number;
    sort?: string | Record<string, any>;
    select?: string;
    populate?: any;
    lean?: boolean;
    collation?: Record<string, any>;
  }

  interface Model<TRawDocType, TQueryHelpers = {}, TInstanceMethods = {}, TVirtuals = {}> {
    /** From `paginatePlugin`. Leans by default — list responses never need instance methods. */
    paginate(
      filter?: Record<string, any>,
      options?: PaginateOptions,
    ): Promise<PaginateResult<any>>;

    /** From `paginatePlugin`. Cursor pagination, for surfaces that cannot tolerate drift. */
    paginateCursor(
      filter?: Record<string, any>,
      options?: { cursor?: string | null; limit?: number; select?: string; populate?: any },
    ): Promise<CursorPaginateResult<any>>;
  }

  interface Document {
    /**
     * From `softDeletePlugin`. `null` means live; ordinary reads exclude non-null rows.
     *
     * `globalThis.Date`, not `Date` — inside `declare module 'mongoose'` the bare name
     * resolves to Mongoose's own `Date` *schema type* export, so `this.deletedAt = new Date()`
     * fails with "Type 'Date' is missing the following properties from type 'Date'".
     */
    deletedAt?: globalThis.Date | null;
    deletedBy?: Types.ObjectId | string | null;

    /** From `softDeletePlugin`. Marks the row deleted and saves; never removes it. */
    softDelete(deletedBy?: Types.ObjectId | string | null): Promise<any>;
    restore(): Promise<any>;

    /** Virtual from `softDeletePlugin`. */
    isDeleted?: boolean;
  }

  interface Query<ResultType, DocType, THelpers = {}, RawDocType = DocType, QueryOp = 'find'> {
    /** Opt back in to soft-deleted rows. The safe behaviour is the default. */
    withDeleted(): this;
    onlyDeleted(): this;
  }
}
