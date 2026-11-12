import { TopicBody } from '../components/TopicBody';
import { APP_ADDRESS, GUIDE } from '../guide';

/**
 * The whole guide on one page, a topic per sheet: e2e/guide/ prints it to the PDF that
 * «Ayuda» offers for download.
 */
export function HelpPrintPage() {
  return (
    <>
      <div className="flex flex-col gap-4">
        <p className="text-xs tracking-widest text-muted-foreground uppercase">
          Edificio Correspondencia 63
        </p>
        <h1 className="font-heading text-3xl font-bold">Guía de DepAdmin</h1>
        <p className="text-lg/relaxed">
          Para los dueños: cómo entrar, ver los balances y tu estado de cuenta, y qué hacer cuando
          te toca el turno. La app está en {APP_ADDRESS}.
        </p>
        <ol className="list-decimal pl-6 text-lg/relaxed">
          {GUIDE.map((topic) => (
            <li key={topic.slug}>{topic.title}</li>
          ))}
        </ol>
      </div>
      {GUIDE.map((topic) => (
        <article key={topic.slug} className="flex flex-col gap-6 pt-10 print:break-before-page">
          <h2 className="font-heading text-2xl font-bold">{topic.title}</h2>
          <TopicBody topic={topic} level={3} eager />
        </article>
      ))}
    </>
  );
}
