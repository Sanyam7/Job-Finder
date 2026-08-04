import { HTTP_STATUS } from '../constants/httpStatus.js';

/**
 * ★ The response wrapper. No controller anywhere calls `res.json()` directly.
 *
 * Every response — success or failure, paginated or not — carries the same envelope, so the
 * client has exactly one shape to parse and one place to read `meta.requestId` from when a
 * user reports a problem.
 */
export class ApiResponse {
  /**
   * @param {import('express').Response} res
   * `summary` rides alongside `pagination` on list responses that carry aggregate counts —
   * the applicant inbox needs its per-status funnel in the same round trip as the rows.
   *
   * @param {{statusCode?: number, message?: string, data?: unknown,
   *          pagination?: Record<string, unknown>|null,
   *          summary?: Record<string, unknown>|null,
   *          headers?: Record<string, string>}} payload
   */
  static send(
    res,
    { statusCode = HTTP_STATUS.OK, message = 'Success', data, pagination, summary, headers },
  ) {
    if (headers) {
      for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
    }
    return res.status(statusCode).json({
      success: statusCode < 400,
      statusCode,
      message,
      ...(data !== undefined ? { data } : {}),
      ...(pagination ? { pagination } : {}),
      ...(summary ? { summary } : {}),
      meta: {
        requestId: res.locals?.requestId ?? null,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /** @param {import('express').Response} res */
  static ok(res, data, message = 'Success') {
    return this.send(res, { statusCode: HTTP_STATUS.OK, data, message });
  }

  /** @param {import('express').Response} res */
  static created(res, data, message = 'Created successfully') {
    return this.send(res, { statusCode: HTTP_STATUS.CREATED, data, message });
  }

  /**
   * 202 — the work was queued, not finished. Used by resume upload, which hands off to the
   * parse worker instead of blocking the request for several seconds.
   * @param {import('express').Response} res
   */
  static accepted(res, data, message = 'Accepted for processing') {
    return this.send(res, { statusCode: HTTP_STATUS.ACCEPTED, data, message });
  }

  /** @param {import('express').Response} res */
  static noContent(res) {
    return res.status(HTTP_STATUS.NO_CONTENT).end();
  }

  /**
   * @param {import('express').Response} res
   * @param {{items: unknown[], page: number, limit: number, totalItems: number}} result
   * @param {string} [message]
   * @param {Record<string, unknown>|null} [summary] page-independent aggregates that belong
   *   with the list but are not part of it — funnel counts, facet counts, unread totals.
   *   Kept out of `data` so `data` is always exactly the array the client maps over.
   */
  static paginated(
    res,
    { items, page, limit, totalItems },
    message = 'Fetched successfully',
    summary = null,
  ) {
    const safeLimit = Math.max(Number(limit) || 1, 1);
    const safePage = Math.max(Number(page) || 1, 1);
    const totalPages = Math.max(Math.ceil(totalItems / safeLimit), 1);

    return this.send(res, {
      statusCode: HTTP_STATUS.OK,
      message,
      data: items,
      pagination: {
        page: safePage,
        limit: safeLimit,
        totalItems,
        totalPages,
        hasNextPage: safePage < totalPages,
        hasPrevPage: safePage > 1,
      },
      summary,
    });
  }
}

export default ApiResponse;
