import React from 'react';
import Editor from '@monaco-editor/react';
import { Save, X } from 'lucide-react';

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  json: 'json', yaml: 'yaml', yml: 'yaml',
  md: 'markdown', html: 'html', htm: 'html',
  css: 'css', scss: 'scss', less: 'less',
  py: 'python', sh: 'shell', bash: 'shell', zsh: 'shell',
  go: 'go', java: 'java', rb: 'ruby', php: 'php', rs: 'rust',
  sql: 'sql', xml: 'xml', toml: 'ini', ini: 'ini', conf: 'ini',
  env: 'ini', properties: 'ini', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp',
  cs: 'csharp', ps1: 'powershell', txt: 'plaintext', log: 'plaintext',
};

function getLanguage(filePath: string): string {
  const fileName = (filePath.split('/').pop() || '').toLowerCase();
  if (fileName === 'dockerfile') return 'dockerfile';
  const ext = fileName.includes('.') ? fileName.split('.').pop()! : '';
  return LANGUAGE_BY_EXTENSION[ext] || 'plaintext';
}

interface PodFileEditorProps {
  filePath: string;
  content: string;
  onChange: (content: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  isDirty: boolean;
  error: string | null;
}

export const PodFileEditor: React.FC<PodFileEditorProps> = ({
  filePath, content, onChange, onSave, onCancel, isSaving, isDirty, error,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, overflow: 'hidden' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Editing:</span>
          <span
            style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-main)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
            title={filePath}
          >
            {filePath}{isDirty ? ' •' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onCancel} disabled={isSaving}>
            <X size={14} /> Cancel
          </button>
          <button className="btn btn-primary" onClick={onSave} disabled={isSaving || !isDirty}>
            <Save size={14} /> {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ color: 'var(--accent-error)', fontSize: '0.8rem', marginBottom: 8 }}>
          {error}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 400, border: '1px solid var(--border-color)', borderRadius: 4, overflow: 'hidden' }}>
        <Editor
          height="100%"
          path={filePath}
          language={getLanguage(filePath)}
          theme="vs-dark"
          value={content}
          onChange={(val) => onChange(val ?? '')}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: 'monospace',
            automaticLayout: true,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            tabSize: 2,
            wordWrap: 'on',
          }}
        />
      </div>
    </div>
  );
};
