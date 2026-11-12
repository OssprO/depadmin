import { CaretRightIcon, FilePdfIcon } from '@phosphor-icons/react';
import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { GUIDE, GUIDE_PDF } from '../guide';

/** The list of tasks the guide explains, and the whole guide as a PDF. */
export function HelpPage() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-bold">Ayuda</h1>
        <p className="text-lg/relaxed">
          Elige lo que quieres hacer. Cada tarea va paso por paso, con la pantalla que vas a ver.
        </p>
      </div>
      <Card>
        <CardContent>
          <ul className="divide-y">
            {GUIDE.map((topic) => (
              <li key={topic.slug}>
                <Link
                  to="/help/$topic"
                  params={{ topic: topic.slug }}
                  className="flex items-center gap-3 py-4"
                >
                  <span className="flex flex-1 flex-col gap-1">
                    <span className="text-lg font-medium">{topic.title}</span>
                    <span className="text-muted-foreground">{topic.summary}</span>
                  </span>
                  <CaretRightIcon className="size-6 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <a
        href={GUIDE_PDF}
        download
        className={buttonVariants({ variant: 'outline', size: 'lg', className: 'self-start' })}
      >
        <FilePdfIcon /> Descargar la guía en PDF
      </a>
      <p className="text-muted-foreground">
        Para compartirla, por ejemplo por WhatsApp, descárgala y mándala como documento.
      </p>
    </>
  );
}
