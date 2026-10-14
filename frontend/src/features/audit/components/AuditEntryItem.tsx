import type { AuditLogEntry } from '@depadmin/shared';
import { formatTime } from '@/lib/format';
import { describeEntry } from '../labels';

export function AuditEntryItem({ entry }: { entry: AuditLogEntry }) {
  const text = describeEntry(entry);

  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{text.title}</span>
        <time dateTime={entry.occurredAt} className="shrink-0 text-muted-foreground tabular-nums">
          {formatTime(entry.occurredAt)}
        </time>
      </div>
      <p className="text-muted-foreground">
        {text.actor} · {text.subject}
      </p>
      {text.changes.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-muted-foreground">
          {text.changes.map((change) => (
            <div key={change.field} className="contents">
              <dt>{change.field}:</dt>
              <dd className="text-foreground">{change.text}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}
