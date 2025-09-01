'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/design-system';
import { Edit, Eye, Bold, Italic, List, Link, Code } from 'lucide-react';
import { WidgetConfigData } from '../dashboard/WidgetConfig';
import { WidgetContainer } from './WidgetContainer';

export interface TextWidgetProps {
  config: WidgetConfigData;
  onConfigClick: () => void;
  onDeleteClick: () => void;
  isReadOnly?: boolean;
}

const defaultContent = `# Welcome to Your Dashboard

This is a **text widget** where you can add:

- Documentation
- Notes and insights
- *Formatted text* with markdown
- Links to external resources

## Features

- Full markdown support
- Live preview
- Easy editing interface

> Use this space to provide context and insights for your dashboard viewers.

\`\`\`
Code blocks are supported too!
\`\`\`

[Learn more about markdown](https://www.markdownguide.org/)
`;

export function TextWidget({ 
  config, 
  onConfigClick, 
  onDeleteClick, 
  isReadOnly 
}: TextWidgetProps) {
  const [content, setContent] = useState<string>(defaultContent);
  const [isEditing, setIsEditing] = useState(false);
  const [tempContent, setTempContent] = useState<string>('');

  useEffect(() => {
    // Load content from config or use default
    const savedContent = (config as any)?.content || defaultContent;
    setContent(savedContent);
    setTempContent(savedContent);
  }, [config]);

  const handleEdit = () => {
    setTempContent(content);
    setIsEditing(true);
  };

  const handleSave = () => {
    setContent(tempContent);
    setIsEditing(false);
    // In a real implementation, this would save to the config
    // onConfigChange({ ...config, content: tempContent });
  };

  const handleCancel = () => {
    setTempContent(content);
    setIsEditing(false);
  };

  const insertMarkdown = (syntax: string, placeholder: string = '') => {
    const textarea = document.querySelector('.markdown-editor') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = tempContent.substring(start, end) || placeholder;
    
    let newText = '';
    switch (syntax) {
      case 'bold':
        newText = `**${selectedText}**`;
        break;
      case 'italic':
        newText = `*${selectedText}*`;
        break;
      case 'link':
        newText = `[${selectedText || 'link text'}](url)`;
        break;
      case 'code':
        newText = `\`${selectedText}\``;
        break;
      case 'list':
        newText = `- ${selectedText || 'list item'}`;
        break;
      default:
        return;
    }

    const updatedContent = 
      tempContent.substring(0, start) + 
      newText + 
      tempContent.substring(end);
    
    setTempContent(updatedContent);
    
    // Re-focus and set cursor position
    setTimeout(() => {
      textarea.focus();
      const newPosition = start + newText.length;
      textarea.setSelectionRange(newPosition, newPosition);
    }, 0);
  };

  const renderMarkdown = (text: string) => {
    // Simple markdown renderer - in a real app, use a proper markdown library
    return text
      .replace(/^# (.*$)/gm, '<h1 class="text-xl font-bold mb-3">$1</h1>')
      .replace(/^## (.*$)/gm, '<h2 class="text-lg font-semibold mb-2">$1</h2>')
      .replace(/^### (.*$)/gm, '<h3 class="text-base font-medium mb-2">$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-card-border/30 px-1 rounded text-sm">$1</code>')
      .replace(/^\- (.*$)/gm, '<li class="ml-4">• $1</li>')
      .replace(/^\> (.*$)/gm, '<blockquote class="border-l-4 border-primary pl-4 my-2 italic text-foreground-muted">$1</blockquote>')
      .replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" class="text-primary hover:underline" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/```([\s\S]*?)```/g, '<pre class="bg-card-border/20 p-3 rounded-lg overflow-x-auto my-2"><code>$1</code></pre>')
      .replace(/\n/g, '<br>');
  };

  const headerActions = !isReadOnly ? (
    <div className="flex items-center gap-1">
      {isEditing ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            className="text-green-400 hover:text-green-300"
          >
            Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="text-foreground-muted hover:text-foreground"
          >
            Cancel
          </Button>
        </>
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleEdit}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Edit className="w-4 h-4" />
        </Button>
      )}
    </div>
  ) : null;

  return (
    <WidgetContainer
      title={config.title || 'Text Widget'}
      onConfigClick={onConfigClick}
      onDeleteClick={onDeleteClick}
      isReadOnly={isReadOnly}
      headerActions={headerActions}
      className="h-full"
    >
      <div className="h-full flex flex-col">
        {isEditing ? (
          <>
            {/* Editing Toolbar */}
            <div className="flex items-center gap-2 p-3 border-b border-card-border bg-background/50">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => insertMarkdown('bold')}
                className="p-1"
              >
                <Bold className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => insertMarkdown('italic')}
                className="p-1"
              >
                <Italic className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => insertMarkdown('list')}
                className="p-1"
              >
                <List className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => insertMarkdown('link')}
                className="p-1"
              >
                <Link className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => insertMarkdown('code')}
                className="p-1"
              >
                <Code className="w-4 h-4" />
              </Button>
              <div className="ml-auto text-xs text-foreground-muted">
                Markdown supported
              </div>
            </div>

            {/* Editor */}
            <div className="flex-1 p-4">
              <textarea
                className="markdown-editor w-full h-full bg-transparent border border-card-border rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono text-sm"
                value={tempContent}
                onChange={(e) => setTempContent(e.target.value)}
                placeholder="Enter your markdown content..."
              />
            </div>
          </>
        ) : (
          /* Preview */
          <div className="flex-1 overflow-auto p-4">
            <div 
              className="prose prose-invert max-w-none text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ 
                __html: renderMarkdown(content) 
              }}
            />
          </div>
        )}
      </div>
    </WidgetContainer>
  );
}