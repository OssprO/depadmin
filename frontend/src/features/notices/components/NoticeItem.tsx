import type { Notice } from '@depadmin/shared';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatFullDate } from '@/lib/format';
import { publishedLine } from '../labels';
import { WithdrawNoticeDialog } from './WithdrawNoticeDialog';

interface NoticeItemProps {
  readonly notice: Notice;
  /** Not read when the screen opened. */
  readonly fresh: boolean;
  readonly canWithdraw: boolean;
}

/** One notice as written: its line breaks kept, who published it and until when. */
export function NoticeItem({ notice, fresh, canWithdraw }: NoticeItemProps) {
  return (
    <Card size="sm" role="article" aria-labelledby={`notice-${notice.id}`}>
      <CardHeader>
        <CardTitle>
          <h3 id={`notice-${notice.id}`} className="flex flex-wrap items-center gap-2">
            {notice.title} {fresh && <Badge>Nuevo</Badge>}
          </h3>
        </CardTitle>
        <CardDescription>
          {publishedLine(notice)}
          {notice.expiresOn &&
            `${notice.current ? ' · vigente' : ' ·'} hasta el ${formatFullDate(notice.expiresOn)}`}
        </CardDescription>
        {canWithdraw && (
          <CardAction>
            <WithdrawNoticeDialog id={notice.id} title={notice.title} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <p className="break-words whitespace-pre-line">{notice.body}</p>
      </CardContent>
    </Card>
  );
}
