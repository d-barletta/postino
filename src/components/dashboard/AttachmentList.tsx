import { Paperclip } from 'lucide-react';

interface AttachmentListProps {
  names: string[];
}

export function AttachmentList({ names }: AttachmentListProps) {
  return (
    <ul className="list-none space-y-0.5">
      {names.map((name, i) => (
        <li key={`${i}-${name}`} className="flex items-center gap-1 min-w-0">
          <Paperclip className="h-3 w-3 shrink-0 text-gray-400" />
          <span className="truncate">{name}</span>
        </li>
      ))}
    </ul>
  );
}
