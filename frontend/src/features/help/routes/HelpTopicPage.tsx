import { CaretRightIcon, ListBulletsIcon } from '@phosphor-icons/react';
import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { TopicBody } from '../components/TopicBody';
import { GUIDE, type GuideTopic } from '../guide';

/** One task of the guide, then the way to the next one. */
export function HelpTopicPage({ topic }: { topic: GuideTopic }) {
  const next = GUIDE[GUIDE.indexOf(topic) + 1];
  return (
    <>
      <h1 className="font-heading text-2xl font-bold">{topic.title}</h1>
      <TopicBody topic={topic} level={2} />
      <nav aria-label="Guía" className="flex flex-col gap-3 border-t pt-6">
        {next && (
          <Link
            to="/help/$topic"
            params={{ topic: next.slug }}
            className={buttonVariants({ size: 'lg', className: 'justify-between' })}
          >
            Siguiente: {next.title} <CaretRightIcon />
          </Link>
        )}
        <Link to="/help" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          <ListBulletsIcon /> Todas las tareas
        </Link>
      </nav>
    </>
  );
}
