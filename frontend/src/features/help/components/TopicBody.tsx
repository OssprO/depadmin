import type { GuideTopic } from '../guide';
import { shotUrl } from '../guide';

interface TopicBodyProps {
  readonly topic: GuideTopic;
  /** The level of the section headings: 2 on a topic's page, 3 inside the whole guide. */
  readonly level: 2 | 3;
  /** Load every screenshot at once, for printing. */
  readonly eager?: boolean;
}

/** A topic's steps, numbered, each with its screenshot; then its tips. */
export function TopicBody({ topic, level, eager = false }: TopicBodyProps) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <div className="flex flex-col gap-6">
      {topic.intro && <p className="text-lg/relaxed">{topic.intro}</p>}
      {topic.sections.map((section, index) => (
        <section key={section.heading ?? index} className="flex flex-col gap-4">
          {section.heading && (
            <Heading className="font-heading text-lg font-bold">{section.heading}</Heading>
          )}
          <ol className="flex flex-col gap-8">
            {section.steps.map((step, number) => (
              <li key={step.text} className="flex gap-4 break-inside-avoid">
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center bg-primary text-lg font-bold text-primary-foreground"
                >
                  {number + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <p className="text-lg/relaxed">{step.text}</p>
                  {step.shot && (
                    // Taken at twice the phone's size: `2x` shows them as big as on the phone.
                    <img
                      src={shotUrl(step.shot)}
                      srcSet={`${shotUrl(step.shot)} 2x`}
                      alt={step.alt ?? ''}
                      loading={eager ? 'eager' : 'lazy'}
                      className="max-w-full self-start border print:max-h-[10cm]"
                    />
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {topic.tips && (
        <aside aria-label="Consejos" className="flex flex-col gap-2 border-l-4 border-primary pl-4">
          {topic.tips.map((tip) => (
            <p key={tip} className="text-lg/relaxed">
              {tip}
            </p>
          ))}
        </aside>
      )}
    </div>
  );
}
