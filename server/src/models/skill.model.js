import mongoose from 'mongoose';
import { slugify } from '@verihire/shared';
import { paginatePlugin } from './plugins/paginate.plugin.js';
import { toJSONPlugin } from './plugins/toJSON.plugin.js';

/**
 * The skill taxonomy — the one genuinely normalised reference collection (ADR-009).
 *
 * It exists because free-text skills make search unusable: "ReactJS", "React.js", "react"
 * and "React" are one skill to a human and four to a database. `aliases` collapses them to
 * a canonical name so a filter for React matches every candidate who meant React.
 */
const skillSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 60 },
    slug: { type: String, unique: true, lowercase: true, index: true },
    category: {
      type: String,
      enum: [
        'LANGUAGE',
        'FRAMEWORK',
        'DATABASE',
        'CLOUD',
        'DEVOPS',
        'DESIGN',
        'DATA',
        'MOBILE',
        'TESTING',
        'SOFT_SKILL',
        'TOOL',
        'OTHER',
      ],
      default: 'OTHER',
      index: true,
    },
    aliases: [{ type: String, lowercase: true, trim: true }],

    /** Bumped as candidates and jobs reference it — powers "popular skills" ordering. */
    usageCount: { type: Number, default: 0, index: true },

    /**
     * Candidate-entered skills arrive unapproved so an admin can curate them. They are
     * still usable immediately — gating a candidate's profile on admin review of the word
     * "Svelte" would be absurd — but only approved skills appear in autocomplete.
     */
    isApproved: { type: Boolean, default: false, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

skillSchema.index({ name: 'text', aliases: 'text' });
skillSchema.index({ isApproved: 1, usageCount: -1 });

skillSchema.pre('save', function generateSlug(next) {
  if (this.isModified('name') || !this.slug) this.slug = slugify(this.name);
  return next();
});

/**
 * Resolves a free-text skill to its canonical record.
 * @this {import('mongoose').Model<any>}
 * @param {string} input
 */
skillSchema.statics.resolve = function resolve(input) {
  const needle = String(input ?? '').trim().toLowerCase();
  if (!needle) return null;
  return this.findOne({
    $or: [{ slug: slugify(needle) }, { aliases: needle }],
  });
};

skillSchema.plugin(toJSONPlugin);
skillSchema.plugin(paginatePlugin);

export const Skill = mongoose.model('Skill', skillSchema);
export default Skill;
