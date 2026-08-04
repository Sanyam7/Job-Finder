import { LIMITS } from '@verihire/shared';

/**
 * Offset pagination as a model static.
 *
 * `.lean()` is the default: Mongoose document hydration is the single largest avoidable cost
 * in a list endpoint, and a list response never needs instance methods.
 *
 * @param {import('mongoose').Schema} schema
 */
export const paginatePlugin = (schema) => {
  /**
   * @param {Record<string, any>} [filter]
   * @param {{page?: number, limit?: number, sort?: string|Record<string, any>,
   *          select?: string, populate?: any, lean?: boolean,
   *          collation?: Record<string, any>}} [options]
   * @returns {Promise<{items: any[], page: number, limit: number, totalItems: number}>}
   */
  schema.statics.paginate = async function paginate(filter = {}, options = {}) {
    const page = clamp(Number(options.page) || 1, 1, LIMITS.MAX_PAGE);
    const limit = clamp(Number(options.limit) || LIMITS.DEFAULT_PAGE_SIZE, 1, LIMITS.MAX_PAGE_SIZE);
    const skip = (page - 1) * limit;
    const lean = options.lean !== false;

    let query = this.find(filter)
      .sort(options.sort ?? '-createdAt')
      .skip(skip)
      .limit(limit);

    if (options.select) query = query.select(options.select);
    if (options.populate) query = query.populate(options.populate);
    if (options.collation) query = query.collation(options.collation);
    if (lean) query = query.lean();

    const [items, totalItems] = await Promise.all([
      query.exec(),
      this.countDocuments(filter).exec(),
    ]);

    return { items, page, limit, totalItems };
  };

  /**
   * Cursor pagination for infinite-scroll surfaces.
   *
   * Offset pagination drifts when new rows land at the top mid-scroll — the user sees the
   * same job twice. A cursor anchored on `_id` cannot drift.
   *
   * @param {Record<string, any>} [filter]
   * @param {{cursor?: string|null, limit?: number, select?: string, populate?: any}} [options]
   */
  schema.statics.paginateCursor = async function paginateCursor(filter = {}, options = {}) {
    const limit = clamp(Number(options.limit) || LIMITS.DEFAULT_PAGE_SIZE, 1, LIMITS.MAX_PAGE_SIZE);
    const cursorFilter = options.cursor
      ? { ...filter, _id: { $lt: decodeCursor(options.cursor) } }
      : filter;

    let query = this.find(cursorFilter).sort({ _id: -1 }).limit(limit + 1);
    if (options.select) query = query.select(options.select);
    if (options.populate) query = query.populate(options.populate);

    const rows = await query.lean().exec();
    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;

    return {
      items,
      hasNextPage,
      nextCursor: hasNextPage ? encodeCursor(items.at(-1)?._id) : null,
    };
  };
};

/** @param {number} value @param {number} min @param {number} max */
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/** @param {unknown} id */
const encodeCursor = (id) => Buffer.from(String(id)).toString('base64url');

/** @param {string} cursor */
const decodeCursor = (cursor) => Buffer.from(cursor, 'base64url').toString('utf8');

export default paginatePlugin;
