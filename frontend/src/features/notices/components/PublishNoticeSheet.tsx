import {
  NOTICE_BODY_MAX_LENGTH,
  NOTICE_TITLE_MAX_LENGTH,
  type PublishNoticeRequest,
  publishNoticeRequestSchema,
} from '@depadmin/shared';
import { MegaphoneIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { FormError } from '@/components/FormError';
import { FormSheetContent } from '@/components/FormSheetContent';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/error-messages';
import { buildingToday } from '@/lib/format';
import { usePublishNotice } from '../api';

type Errors = Partial<Record<keyof PublishNoticeRequest, string>>;
const blank = { title: '', body: '', expiresOn: '' };

/**
 * The shift administrator or the superadmin publishes a notice (ADR-0034). It cannot be
 * edited afterwards, because its email goes out at once, so the form says so.
 */
export function PublishNoticeSheet() {
  const publish = usePublishNotice();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState<Errors>({});
  const today = buildingToday();

  const submit = async () => {
    const parsed = publishNoticeRequestSchema.safeParse({
      ...form,
      expiresOn: form.expiresOn || null,
    });
    if (!parsed.success) {
      const found: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof PublishNoticeRequest;
        found[field] ??= field === 'expiresOn' ? 'Elige un día' : issue.message;
      }
      setErrors(found);
      return;
    }
    setErrors({});
    try {
      await publish.mutateAsync(parsed.data);
      setOpen(false);
    } catch {
      // The error shows below the form.
    }
  };

  const field = (name: keyof typeof form) => ({
    value: form[name],
    'aria-invalid': !!errors[name],
    onChange: (event: { target: { value: string } }) =>
      setForm((values) => ({ ...values, [name]: event.target.value })),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setForm(blank);
          setErrors({});
          publish.reset();
        }
      }}
    >
      <SheetTrigger render={<Button />}>
        <MegaphoneIcon />
        Publicar aviso
      </SheetTrigger>
      <FormSheetContent>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <SheetHeader>
            <SheetTitle>Publicar aviso</SheetTitle>
            <SheetDescription>
              Lo ven todos en la app, y le llega por correo a quien lo tenga confirmado: no escribas
              importes ni nombres. Ya publicado no se puede editar, solo retirar.
            </SheetDescription>
          </SheetHeader>
          <FieldGroup className="px-4">
            <Field data-invalid={!!errors.title}>
              <FieldLabel htmlFor="notice-title">Título</FieldLabel>
              <Input
                id="notice-title"
                autoComplete="off"
                maxLength={NOTICE_TITLE_MAX_LENGTH}
                {...field('title')}
              />
              <FieldError>{errors.title}</FieldError>
            </Field>
            <Field data-invalid={!!errors.body}>
              <FieldLabel htmlFor="notice-body">Aviso</FieldLabel>
              <Textarea
                id="notice-body"
                rows={6}
                maxLength={NOTICE_BODY_MAX_LENGTH}
                {...field('body')}
              />
              <FieldError>{errors.body}</FieldError>
            </Field>
            <Field data-invalid={!!errors.expiresOn}>
              <FieldLabel htmlFor="notice-expires">Vigente hasta (opcional)</FieldLabel>
              <Input id="notice-expires" type="date" min={today} {...field('expiresOn')} />
              <FieldDescription>
                Después de ese día sale de Inicio y pasa a «Anteriores».
              </FieldDescription>
              <FieldError>{errors.expiresOn}</FieldError>
            </Field>
            <FormError message={publish.isError ? errorMessage(publish.error) : null} />
          </FieldGroup>
          <SheetFooter>
            <Button type="submit" disabled={publish.isPending}>
              {publish.isPending ? 'Publicando…' : 'Publicar'}
            </Button>
          </SheetFooter>
        </form>
      </FormSheetContent>
    </Sheet>
  );
}
