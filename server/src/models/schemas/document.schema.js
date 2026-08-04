import mongoose from 'mongoose';

/**
 * A Cloudinary asset reference.
 *
 * `publicId` — not `url` — is the identity. URLs for private assets are signed and
 * short-lived, so persisting one would store something that expires; the publicId is
 * stable and is what we re-sign from on every access.
 */
export const documentSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    originalName: { type: String, trim: true, maxlength: 255 },
    format: { type: String, trim: true, lowercase: true },
    resourceType: { type: String, trim: true, default: 'image' },
    sizeBytes: { type: Number, min: 0 },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 },
    /** `authenticated` assets are never publicly readable — used for resumes and KYC docs. */
    accessMode: {
      type: String,
      enum: ['public', 'authenticated'],
      default: 'public',
    },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

export default documentSchema;
