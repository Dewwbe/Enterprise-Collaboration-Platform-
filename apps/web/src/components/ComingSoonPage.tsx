import { EmptyState } from './ui/EmptyState';

interface ComingSoonPageProps {
  title: string;
  description: string;
}

/**
 * Placeholder for a route whose page hasn't been built yet (see the
 * follow-up branches in the design-system plan). Replaced file-by-file as
 * each resource page ships - never meant to be a permanent page.
 */
export function ComingSoonPage({ title, description }: ComingSoonPageProps) {
  return (
    <EmptyState
      title={`${title} — coming soon`}
      description={description}
    />
  );
}
