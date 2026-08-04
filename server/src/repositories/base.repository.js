/**
 * Generic data access.
 *
 * ★ ADR-003 — repositories are the ONLY layer that constructs queries. Services express
 * intent ("find the pending employers"), repositories express Mongo. That separation is
 * what makes services unit-testable without a database, and it is what lets the search
 * implementation move to Atlas Search later by editing one file.
 *
 * @template T
 */
export class BaseRepository {
  /** @param {import('mongoose').Model<any>} model */
  constructor(model) {
    this.model = model;
  }

  /**
   * @param {Record<string, any>} data
   * @param {{session?: import('mongoose').ClientSession}} [opts]
   * @returns {Promise<any>}
   */
  async create(data, opts = {}) {
    const [doc] = await this.model.create([data], { session: opts.session });
    return doc;
  }

  /**
   * @param {Record<string, any>[]} docs
   * @param {{session?: import('mongoose').ClientSession, ordered?: boolean}} [opts]
   */
  async createMany(docs, opts = {}) {
    return this.model.insertMany(docs, { session: opts.session, ordered: opts.ordered ?? false });
  }

  /**
   * @param {string} id
   * @param {{select?: string, populate?: any, lean?: boolean,
   *          session?: import('mongoose').ClientSession}} [opts]
   */
  findById(id, opts = {}) {
    return this.#applyOptions(this.model.findById(id), opts);
  }

  /**
   * @param {Record<string, any>} filter
   * @param {{select?: string, populate?: any, lean?: boolean, sort?: any,
   *          session?: import('mongoose').ClientSession}} [opts]
   */
  findOne(filter, opts = {}) {
    const query = this.model.findOne(filter);
    if (opts.sort) query.sort(opts.sort);
    return this.#applyOptions(query, opts);
  }

  /**
   * @param {Record<string, any>} [filter]
   * @param {{select?: string, populate?: any, lean?: boolean, sort?: any, limit?: number,
   *          skip?: number, session?: import('mongoose').ClientSession}} [opts]
   */
  find(filter = {}, opts = {}) {
    const query = this.model.find(filter);
    if (opts.sort) query.sort(opts.sort);
    if (opts.skip) query.skip(opts.skip);
    if (opts.limit) query.limit(opts.limit);
    return this.#applyOptions(query, opts);
  }

  /**
   * @param {Record<string, any>} [filter]
   * @param {{page?: number, limit?: number, sort?: any, select?: string, populate?: any}} [options]
   */
  paginate(filter = {}, options = {}) {
    return this.model.paginate(filter, options);
  }

  /** @param {Record<string, any>} [filter] */
  count(filter = {}) {
    return this.model.countDocuments(filter);
  }

  /** @param {Record<string, any>} filter */
  async exists(filter) {
    return Boolean(await this.model.exists(filter));
  }

  /**
   * @param {string} id
   * @param {Record<string, any>} update
   * @param {{session?: import('mongoose').ClientSession, lean?: boolean,
   *          runValidators?: boolean, select?: string, populate?: any}} [opts]
   */
  updateById(id, update, opts = {}) {
    const query = this.model.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: opts.runValidators ?? true,
      session: opts.session,
    });
    return this.#applyOptions(query, opts);
  }

  /**
   * @param {Record<string, any>} filter
   * @param {Record<string, any>} update
   * @param {{session?: import('mongoose').ClientSession, lean?: boolean, upsert?: boolean}} [opts]
   */
  updateOne(filter, update, opts = {}) {
    const query = this.model.findOneAndUpdate(filter, update, {
      new: true,
      runValidators: true,
      upsert: opts.upsert ?? false,
      session: opts.session,
    });
    return this.#applyOptions(query, opts);
  }

  /**
   * @param {Record<string, any>} filter
   * @param {Record<string, any>} update
   * @param {{session?: import('mongoose').ClientSession}} [opts]
   */
  updateMany(filter, update, opts = {}) {
    return this.model.updateMany(filter, update, { session: opts.session });
  }

  /**
   * Soft delete — the default removal path everywhere in this codebase.
   * @param {string} id
   * @param {string|null} [deletedBy]
   * @param {{session?: import('mongoose').ClientSession}} [opts]
   */
  softDelete(id, deletedBy = null, opts = {}) {
    return this.model.findByIdAndUpdate(
      id,
      { deletedAt: new Date(), deletedBy },
      { new: true, session: opts.session },
    );
  }

  /**
   * Permanent removal. Reserved for the retention cron and test teardown — application
   * code should call `softDelete`.
   * @param {string} id
   */
  hardDelete(id) {
    return this.model.findByIdAndDelete(id);
  }

  /**
   * @param {any[]} pipeline
   * @param {{session?: import('mongoose').ClientSession}} [opts]
   */
  aggregate(pipeline, opts = {}) {
    return this.model.aggregate(pipeline).session(opts.session ?? null);
  }

  /** @param {any[]} operations */
  bulkWrite(operations, opts = {}) {
    return this.model.bulkWrite(operations, { session: opts.session });
  }

  /**
   * @param {import('mongoose').Query<any, any>} query
   * @param {Record<string, any>} opts
   */
  #applyOptions(query, opts) {
    if (opts.select) query.select(opts.select);
    if (opts.populate) query.populate(opts.populate);
    if (opts.session) query.session(opts.session);
    // Reads are lean by default; pass `lean: false` when instance methods are needed.
    if (opts.lean !== false) query.lean();
    return query;
  }
}

export default BaseRepository;
