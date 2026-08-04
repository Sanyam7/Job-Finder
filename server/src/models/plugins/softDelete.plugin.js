/**
 * Soft delete: nothing on a trust platform is ever really removed.
 *
 * Adds `deletedAt` / `deletedBy` and, crucially, a set of query hooks that exclude deleted
 * documents from every ordinary read. Recovering deleted rows requires an explicit
 * `.withDeleted()` — the safe behaviour is the default, and seeing deleted data is opt-in.
 *
 * A moderation decision six months ago must still be reviewable; hard deletes destroy that
 * audit trail. The `cleanupSoftDeleted` cron performs the real removal after 90 days.
 *
 * @param {import('mongoose').Schema} schema
 */
export const softDeletePlugin = (schema) => {
  schema.add({
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: 'ObjectId', ref: 'User', default: null },
  });

  const READ_HOOKS = [
    'find',
    'findOne',
    'findOneAndUpdate',
    'findOneAndDelete',
    'countDocuments',
    'count',
    'updateMany',
    'updateOne',
  ];

  for (const hook of READ_HOOKS) {
    schema.pre(
      /** @type {any} */ (hook),
      /**
       * `this` is a Query here, but the hook name is a runtime string so TypeScript cannot
       * pick the right overload — hence the cast on the name and the explicit `this`.
       *
       * @this {import('mongoose').Query<any, any>}
       * @param {(err?: any) => void} next
       */
      function excludeDeleted(next) {
        // `withDeleted()` sets this option to opt back in.
        if (this.getOptions?.().withDeleted) return next();

        const filter = this.getFilter?.() ?? {};
        // Respect an explicit deletedAt condition from the caller (e.g. the purge cron).
        if (filter.deletedAt === undefined) {
          this.where({ deletedAt: null });
        }
        return next();
      },
    );
  }

  schema.pre('aggregate', function excludeDeletedFromAggregate(next) {
    const pipeline = this.pipeline();
    const optedOut = this.options?.withDeleted;
    const alreadyFiltered = pipeline.some(
      (stage) => '$match' in stage && 'deletedAt' in (stage.$match ?? {}),
    );
    if (!optedOut && !alreadyFiltered) {
      pipeline.unshift({ $match: { deletedAt: null } });
    }
    return next();
  });

  /**
   * @this {import('mongoose').Document}
   * @param {import('mongoose').Types.ObjectId|string|null} [deletedBy]
   */
  schema.methods.softDelete = function softDelete(deletedBy = null) {
    this.deletedAt = new Date();
    this.deletedBy = deletedBy;
    return this.save();
  };

  /** @this {import('mongoose').Document} */
  schema.methods.restore = function restore() {
    this.deletedAt = null;
    this.deletedBy = null;
    return this.save();
  };

  schema.query.withDeleted = function withDeleted() {
    return this.setOptions({ withDeleted: true });
  };

  schema.query.onlyDeleted = function onlyDeleted() {
    return this.setOptions({ withDeleted: true }).where({ deletedAt: { $ne: null } });
  };

  schema.virtual('isDeleted').get(function isDeleted() {
    return this.deletedAt !== null && this.deletedAt !== undefined;
  });
};

export default softDeletePlugin;
