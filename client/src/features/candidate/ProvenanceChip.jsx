import { FIELD_SOURCE, FIELD_SOURCE_META } from '@verihire/shared';
import { Badge } from '../../components/ui/Badge.jsx';

/**
 * ★ ADR-006, surfaced on the editor.
 *
 * The provenance map exists so nobody has to remember which parts of their profile they wrote
 * and which a parser guessed. This chip is where that becomes visible: a field marked PARSER
 * is a machine's reading the candidate accepted, and it is the one a future re-parse may
 * revise. A field marked USER is theirs and is protected — no re-parse can silently replace it.
 *
 * Deliberately silent when there is no source recorded. An "unknown" chip on every untouched
 * field would be noise on a form that is already dense, and absence here means exactly what a
 * user would assume: nothing has been guessed about this field.
 *
 * @param {{source?: string|null, className?: string}} props
 */
export const ProvenanceChip = ({ source, className }) => {
  if (!source) return null;

  const meta = FIELD_SOURCE_META[source];
  if (!meta) return null;

  return (
    <Badge
      tone={meta.tone}
      size="sm"
      className={className}
      // The title carries the consequence, which is the part people actually need and the
      // part a three-word label cannot hold.
      title={
        source === FIELD_SOURCE.USER
          ? 'You wrote this. Re-reading your resume will not change it.'
          : 'This came from your resume. Editing it makes it yours and locks it.'
      }
    >
      {meta.label}
    </Badge>
  );
};

export default ProvenanceChip;
