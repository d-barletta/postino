'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Undo,
  Redo,
  Link as LinkIcon,
  Image as ImageIcon,
} from 'lucide-react';

interface MinimalTiptapEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

export function MinimalTiptapEditor({
  value,
  onChange,
  placeholder = 'Write your article content here...',
  className,
}: MinimalTiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  if (!editor) return null;

  const addImage = () => {
    const url = window.prompt('Image URL');
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  const setLink = () => {
    const url = window.prompt('URL', editor.getAttributes('link').href ?? '');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  type ToolbarButton = {
    action: () => void;
    active?: boolean;
    disabled?: boolean;
    icon: React.ReactNode;
    title: string;
  };

  const toolbarGroups: ToolbarButton[][] = [
    [
      {
        icon: <Bold className="h-3.5 w-3.5" />,
        title: 'Bold',
        action: () => editor.chain().focus().toggleBold().run(),
        active: editor.isActive('bold'),
      },
      {
        icon: <Italic className="h-3.5 w-3.5" />,
        title: 'Italic',
        action: () => editor.chain().focus().toggleItalic().run(),
        active: editor.isActive('italic'),
      },
      {
        icon: <Strikethrough className="h-3.5 w-3.5" />,
        title: 'Strikethrough',
        action: () => editor.chain().focus().toggleStrike().run(),
        active: editor.isActive('strike'),
      },
      {
        icon: <Code className="h-3.5 w-3.5" />,
        title: 'Code',
        action: () => editor.chain().focus().toggleCode().run(),
        active: editor.isActive('code'),
      },
    ],
    [
      {
        icon: <Heading2 className="h-3.5 w-3.5" />,
        title: 'Heading 2',
        action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        active: editor.isActive('heading', { level: 2 }),
      },
      {
        icon: <Heading3 className="h-3.5 w-3.5" />,
        title: 'Heading 3',
        action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        active: editor.isActive('heading', { level: 3 }),
      },
      {
        icon: <Quote className="h-3.5 w-3.5" />,
        title: 'Blockquote',
        action: () => editor.chain().focus().toggleBlockquote().run(),
        active: editor.isActive('blockquote'),
      },
    ],
    [
      {
        icon: <List className="h-3.5 w-3.5" />,
        title: 'Bullet list',
        action: () => editor.chain().focus().toggleBulletList().run(),
        active: editor.isActive('bulletList'),
      },
      {
        icon: <ListOrdered className="h-3.5 w-3.5" />,
        title: 'Ordered list',
        action: () => editor.chain().focus().toggleOrderedList().run(),
        active: editor.isActive('orderedList'),
      },
      {
        icon: <Minus className="h-3.5 w-3.5" />,
        title: 'Horizontal rule',
        action: () => editor.chain().focus().setHorizontalRule().run(),
      },
    ],
    [
      {
        icon: <LinkIcon className="h-3.5 w-3.5" />,
        title: 'Link',
        action: setLink,
        active: editor.isActive('link'),
      },
      {
        icon: <ImageIcon className="h-3.5 w-3.5" />,
        title: 'Image',
        action: addImage,
      },
    ],
    [
      {
        icon: <Undo className="h-3.5 w-3.5" />,
        title: 'Undo',
        action: () => editor.chain().focus().undo().run(),
        disabled: !editor.can().undo(),
      },
      {
        icon: <Redo className="h-3.5 w-3.5" />,
        title: 'Redo',
        action: () => editor.chain().focus().redo().run(),
        disabled: !editor.can().redo(),
      },
    ],
  ];

  return (
    <div className={cn('border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden', className)}>
      <div className="flex flex-wrap gap-1 p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        {toolbarGroups.map((group, gi) => (
          <div key={gi} className="flex items-center gap-0.5">
            {gi > 0 && (
              <div className="w-px h-5 bg-gray-200 dark:bg-gray-600 mx-0.5" />
            )}
            {group.map((btn) => (
              <button
                key={btn.title}
                type="button"
                title={btn.title}
                onClick={btn.action}
                disabled={btn.disabled}
                className={cn(
                  'p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                  btn.active && 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white',
                )}
              >
                {btn.icon}
              </button>
            ))}
          </div>
        ))}
      </div>
      <EditorContent
        editor={editor}
        className="prose prose-sm dark:prose-invert max-w-none p-4 min-h-[300px] focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[280px] [&_.ProseMirror_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child]:before:text-gray-400 [&_.ProseMirror_p.is-editor-empty:first-child]:before:float-left [&_.ProseMirror_p.is-editor-empty:first-child]:before:pointer-events-none"
      />
    </div>
  );
}

interface BlogContentRendererProps {
  content: string;
  className?: string;
}

export function BlogContentRenderer({ content, className }: BlogContentRendererProps) {
  // Tiptap emits empty paragraphs as <p></p> which browsers collapse.
  // Replace them with <p><br></p> so vertical spacing is preserved.
  const html = content.replace(/<p><\/p>/g, '<p><br></p>');

  return (
    <div
      className={cn(
        'prose prose-lg dark:prose-invert max-w-none',
        'prose-headings:font-bold prose-headings:text-gray-900 dark:prose-headings:text-gray-100',
        'prose-p:text-gray-700 dark:prose-p:text-gray-300',
        'prose-a:text-[#a3891f] dark:prose-a:text-[#f3df79] prose-a:no-underline hover:prose-a:underline',
        'prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:rounded prose-code:px-1',
        'prose-blockquote:border-l-[#efd957] prose-blockquote:text-gray-600 dark:prose-blockquote:text-gray-400',
        'prose-img:rounded-xl prose-img:shadow-md',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export { Button };
