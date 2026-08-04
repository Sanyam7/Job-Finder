/**
 * Normalises every document's JSON shape.
 *
 * - `_id` becomes `id` (the client should not know or care that this is MongoDB)
 * - `__v` disappears
 * - any path marked `private: true` in the schema is stripped
 *
 * The last point matters most: it means `passwordHash` cannot leak by someone forgetting a
 * `.select('-passwordHash')` on a new query. The default is safe; exposure is opt-in.
 *
 * @param {import('mongoose').Schema} schema
 */
export const toJSONPlugin = (schema) => {
  /**
   * Mongoose types `transform` as `boolean | Function` — `true` is a valid value meaning
   * "apply the default" — and derives the document type from the specific schema, while this
   * plugin runs against all of them. Both reasons to widen here rather than pretend to know
   * which model is being serialised. The `typeof === 'function'` guard below is what makes
   * the boolean case safe at runtime.
   *
   * @type {any}
   */
  const existingTransform = schema.get('toJSON')?.transform;

  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    /**
     * @param {any} doc
     * @param {Record<string, any>} ret
     * @param {Record<string, any>} options
     */
    transform(doc, ret, options) {
      for (const path of Object.keys(schema.paths)) {
        if (schema.paths[path].options?.private) {
          deletePath(ret, path);
        }
      }

      ret.id = ret._id?.toString?.() ?? ret._id;
      delete ret._id;
      delete ret.__v;

      if (typeof existingTransform === 'function') {
        return existingTransform(doc, ret, options);
      }
      return ret;
    },
  });
};

/**
 * Deletes a possibly-nested dot path from a plain object.
 * @param {Record<string, any>} obj
 * @param {string} path
 */
const deletePath = (obj, path) => {
  const segments = path.split('.');
  let cursor = obj;
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (cursor == null || typeof cursor !== 'object') return;
    cursor = cursor[segments[i]];
  }
  if (cursor && typeof cursor === 'object') delete cursor[segments.at(-1)];
};

export default toJSONPlugin;
