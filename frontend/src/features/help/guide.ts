// The user guide for the owners (phase 18): one task per topic, numbered steps and a
// screenshot per step where the app can show it. The help screens and the PDF both render
// this. The screenshots live in public/help/ and are taken by e2e/guide/, which walks the
// same steps with the button names quoted here (between «»), so a renamed button breaks it.
import { PASSWORD_MIN_LENGTH } from '@depadmin/shared';

export interface GuideStep {
  readonly text: string;
  /** File in public/help/, without the extension. */
  readonly shot?: string;
  /** What the screenshot shows, for screen readers. */
  readonly alt?: string;
}

export interface GuideSection {
  /** Only when a topic splits its steps (Android and iPhone). */
  readonly heading?: string;
  readonly steps: readonly GuideStep[];
}

export interface GuideTopic {
  /** The URL: /help/<slug>. */
  readonly slug: string;
  readonly title: string;
  /** One line, for the list of topics. */
  readonly summary: string;
  readonly intro?: string;
  readonly sections: readonly GuideSection[];
  /** Advice after the steps. */
  readonly tips?: readonly string[];
}

export const APP_ADDRESS = 'depadmin.osspro.site';

/** The guide as a PDF, to share by WhatsApp. Generated with the screenshots. */
export const GUIDE_PDF = '/guia-depadmin.pdf';

export const GUIDE: readonly GuideTopic[] = [
  {
    slug: 'sign-in',
    title: 'Entrar por primera vez',
    summary: 'Tu usuario, la contraseña que te dio el administrador y la tuya',
    sections: [
      {
        steps: [
          {
            text: `Abre ${APP_ADDRESS} en el navegador de tu celular.`,
            shot: 'sign-in',
            alt: 'La pantalla para iniciar sesión, con los campos Usuario y Contraseña.',
          },
          {
            text: 'En «Usuario» escribe el número de tu depto, por ejemplo 401. En «Contraseña», la que te dio el administrador. Luego toca «Entrar».',
          },
          {
            text: 'La primera vez la app te pide elegir tu propia contraseña. Escribe la que te dio el administrador y después tu contraseña nueva dos veces. Toca «Guardar contraseña».',
            shot: 'choose-password',
            alt: 'La pantalla «Elige tu contraseña», con la contraseña temporal y la nueva dos veces.',
          },
          {
            text: 'Listo: llegas a «Inicio», con el dinero en caja, de quién es el turno y qué deptos deben.',
            shot: 'home',
            alt: 'La pantalla de inicio de un dueño.',
          },
        ],
      },
    ],
    tips: [
      `Usa una contraseña de al menos ${PASSWORD_MIN_LENGTH} letras o números que puedas recordar, como una frase corta.`,
      '¿Olvidaste tu contraseña? Pídele al administrador una temporal. Con ella entras y eliges una nueva, igual que la primera vez.',
    ],
  },
  {
    slug: 'change-password',
    title: 'Cambiar tu contraseña',
    summary: 'Cuando quieras una nueva',
    sections: [
      {
        steps: [
          {
            text: 'Toca «Más», abajo a la derecha, y luego «Mi cuenta».',
            shot: 'my-account',
            alt: 'La pantalla «Mi cuenta», con los botones Cambiar contraseña y Cerrar sesión.',
          },
          {
            text: 'Toca «Cambiar contraseña». Escribe tu contraseña actual y la nueva dos veces, y toca «Guardar contraseña».',
            shot: 'change-password',
            alt: 'La pantalla «Cambiar contraseña».',
          },
        ],
      },
    ],
    tips: ['Al cambiarla se cierra tu sesión en tus otros dispositivos.'],
  },
  {
    slug: 'install',
    title: 'Instalar la app en tu celular',
    summary: 'Un ícono en tu pantalla, como cualquier otra app',
    intro:
      'No hace falta descargar nada de la tienda: el navegador agrega el ícono de DepAdmin a tu pantalla de inicio.',
    sections: [
      {
        heading: 'En Android (Chrome)',
        steps: [
          { text: `Abre ${APP_ADDRESS} en Chrome.` },
          { text: 'Toca los tres puntos ⋮, arriba a la derecha.' },
          { text: 'Toca «Instalar app» o «Agregar a la pantalla principal», y confirma.' },
        ],
      },
      {
        heading: 'En iPhone (Safari)',
        steps: [
          { text: `Abre ${APP_ADDRESS} en Safari. Desde otro navegador no se puede.` },
          { text: 'Toca el botón de compartir: un cuadro con una flecha hacia arriba.' },
          { text: 'Toca «Agregar a inicio» y luego «Agregar».' },
        ],
      },
    ],
    tips: ['Después abre DepAdmin desde su ícono. Tu sesión sigue abierta.'],
  },
  {
    slug: 'monthly-report',
    title: 'Ver el balance del mes y su PDF',
    summary: 'Lo que entró, lo que salió y el saldo, como la hoja de cada mes',
    sections: [
      {
        steps: [
          {
            text: 'Toca «Libro», abajo. Ves el mes en curso: con cuánto empezó la caja, lo que entró, lo que salió y el saldo.',
            shot: 'month-summary',
            alt: 'El resumen del mes: saldo inicial, ingresos, egresos y saldo actual.',
          },
          {
            text: 'Más abajo está cada pago y cada gasto, día por día.',
            shot: 'movements',
            alt: 'La lista de movimientos del mes, agrupados por día.',
          },
          {
            text: 'Para ver otro mes, usa las flechas junto al nombre del mes, o toca «Todos los meses».',
            shot: 'all-months',
            alt: 'La lista de todos los meses, cada uno con su saldo.',
          },
          {
            text: 'Toca «Descargar PDF» para guardar el reporte del mes, o «Compartir» para mandarlo por WhatsApp.',
            shot: 'report-pdf',
            alt: 'Los botones Descargar PDF y Compartir.',
          },
        ],
      },
    ],
  },
  {
    slug: 'account-statement',
    title: 'Ver tu estado de cuenta',
    summary: 'Si debes algo o tienes un adelanto',
    sections: [
      {
        steps: [
          {
            text: 'Toca «Más» y luego «Estados de cuenta». Ves si cada depto debe o está al corriente. El tuyo dice «(tú)».',
            shot: 'accounts',
            alt: 'La lista de deptos con lo que debe cada uno.',
          },
          {
            text: 'Toca tu depto para ver cada cuota y multa, y si ya está pagada o pendiente. Cada pago cubre primero lo más antiguo.',
            shot: 'statement',
            alt: 'El estado de cuenta de un depto: su adeudo, su adelanto y sus cuotas.',
          },
        ],
      },
    ],
  },
  {
    slug: 'shift',
    title: 'Cuando te toca el turno',
    summary: 'Anotar los pagos, la basura y la limpieza',
    intro:
      'Cada depto administra dos meses seguidos, en orden: 501, 502, 401, 402, 301, 302, 201, 202, 101 y 102. En «Inicio» ves de quién es el turno. Mientras es el tuyo, en «Libro» anotas todo lo que entra y sale.',
    sections: [
      {
        steps: [
          {
            text: 'Cuando un depto te pague, toca «Agregar» y elige «Pago de depto». Elige el depto, revisa la fecha y el importe (la app sugiere lo que debe) y toca «Guardar».',
            shot: 'payment',
            alt: 'El formulario «Agregar movimiento» con un pago de depto.',
          },
          {
            text: 'Cada semana de basura aparece en «Basura por confirmar». Cuando la pagues, toca «Confirmar». Si cambió el importe o la fecha, toca la semana para ajustarla antes.',
            shot: 'garbage',
            alt: 'La lista «Basura por confirmar», con una semana y su botón Confirmar.',
          },
          {
            text: 'Para la limpieza, toca «Marcar visitas» en «Limpieza por semana», toca los días que vino y luego «Registrar».',
            shot: 'cleaning',
            alt: 'El calendario para marcar las visitas de limpieza.',
          },
          {
            text: 'Para otros ingresos o gastos, toca «Agregar» y elige «Otro ingreso» u «Otro egreso», con una descripción.',
          },
          {
            text: 'Si te equivocas, toca el renglón para corregirlo, mientras el mes siga abierto.',
          },
        ],
      },
    ],
    tips: ['Cada cambio queda anotado en la «Bitácora», con quién lo hizo y cuándo.'],
  },
  {
    slug: 'close-month',
    title: 'Cerrar el mes y entregar el turno',
    summary: 'Del día 1 al 5 del mes siguiente',
    intro:
      'Un mes se cierra cuando ya terminó, y siempre después del anterior. Tienes hasta el día 5 del mes que sigue a tu turno para cerrar tus meses; después solo puede el administrador.',
    sections: [
      {
        steps: [
          {
            text: 'En «Libro», toca la flecha «Mes anterior» hasta llegar al mes que vas a cerrar. Revisa que el saldo cuadre con el efectivo en caja.',
          },
          {
            text: 'Toca «Cerrar el mes» en «Cierre del mes».',
            shot: 'close-month',
            alt: 'La tarjeta «Cierre del mes» con el botón Cerrar el mes.',
          },
          {
            text: 'La app te avisa si falta registrar alguna semana de basura. Si todo está bien, confirma con «Cerrar el mes». El mes queda congelado y su saldo pasa al siguiente.',
            shot: 'close-confirm',
            alt: 'La pregunta para confirmar el cierre, con el saldo final.',
          },
          {
            text: 'Si el depto que sigue no va a tomar el turno, entra a «Turnos» y toca «Registrar entrega» para anotar quién lo cubre. Hazlo también dentro de esos 5 días.',
          },
        ],
      },
    ],
    tips: [
      'Un mes cerrado ya no se puede cambiar. Si hay que corregir algo, pídele al administrador que lo reabra.',
      'El depto que no toma su turno paga una multa por cada mes.',
    ],
  },
];

export function topicBySlug(slug: string): GuideTopic | undefined {
  return GUIDE.find((topic) => topic.slug === slug);
}

export const shotUrl = (shot: string) => `/help/${shot}.png`;
