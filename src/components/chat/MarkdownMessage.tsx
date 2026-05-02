import React, { Fragment, useCallback, useMemo, useState, type ReactNode } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View, Image, Modal } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Paths, File as FSFile } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Copy, Download, X } from 'lucide-react-native';
import SyntaxHighlighter from 'react-native-syntax-highlighter';
import { Renderer, useMarkdown, type MarkedStyles } from 'react-native-marked';
import { useUIStore } from '@/stores/ui-store';

interface MarkdownMessageProps {
  content: string;
  isStreaming?: boolean;
}

interface ParsedMarkdownContentProps {
  content: string;
  isStreaming: boolean;
  onCopyCode: (code: string) => void;
  onImagePress: (uri: string) => void;
}

type StreamingBlock =
  | { type: 'text'; text: string }
  | { type: 'code'; language: string; code: string; open: boolean };

const COLORS = {
  background: '#09090B',
  foreground: '#FAFAFA',
  mutedForeground: '#A1A1AA',
  subtle: '#71717A',
  surface: '#0A0A0C',
  codeSurface: '#18181B',
  border: '#27272A',
  keyword: '#C084FC',
  string: '#86EFAC',
  comment: '#71717A',
  function: '#93C5FD',
  number: '#FDE68A',
  operator: '#A1A1AA',
};

const MONO_FONT = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

const SUPPORTED_LANGUAGES = new Set([
  'bash',
  'c',
  'cpp',
  'csharp',
  'css',
  'dart',
  'diff',
  'dockerfile',
  'go',
  'graphql',
  'html',
  'java',
  'javascript',
  'json',
  'kotlin',
  'lua',
  'markdown',
  'objectivec',
  'php',
  'python',
  'ruby',
  'rust',
  'shell',
  'sql',
  'swift',
  'typescript',
  'xml',
  'yaml',
]);

const LANGUAGE_ALIASES: Record<string, string> = {
  cjs: 'javascript',
  htm: 'html',
  js: 'javascript',
  jsx: 'javascript',
  md: 'markdown',
  mjs: 'javascript',
  py: 'python',
  rb: 'ruby',
  sh: 'bash',
  ts: 'typescript',
  tsx: 'typescript',
  yml: 'yaml',
};

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  bash: 'sh',
  c: 'c',
  cpp: 'cpp',
  csharp: 'cs',
  css: 'css',
  dart: 'dart',
  dockerfile: 'dockerfile',
  go: 'go',
  graphql: 'graphql',
  html: 'html',
  java: 'java',
  javascript: 'js',
  json: 'json',
  kotlin: 'kt',
  lua: 'lua',
  markdown: 'md',
  objectivec: 'm',
  php: 'php',
  python: 'py',
  ruby: 'rb',
  rust: 'rs',
  shell: 'sh',
  sql: 'sql',
  swift: 'swift',
  typescript: 'ts',
  xml: 'xml',
  yaml: 'yaml',
};

const syntaxStyle = {
  hljs: {
    background: COLORS.codeSurface,
    color: COLORS.foreground,
  },
  'hljs-built_in': {
    color: COLORS.function,
  },
  'hljs-bullet': {
    color: COLORS.operator,
  },
  'hljs-comment': {
    color: COLORS.comment,
    fontStyle: 'italic',
  },
  'hljs-keyword': {
    color: COLORS.keyword,
  },
  'hljs-literal': {
    color: COLORS.keyword,
  },
  'hljs-number': {
    color: COLORS.number,
  },
  'hljs-operator': {
    color: COLORS.operator,
  },
  'hljs-params': {
    color: COLORS.foreground,
  },
  'hljs-section': {
    color: COLORS.function,
  },
  'hljs-string': {
    color: COLORS.string,
  },
  'hljs-title': {
    color: COLORS.function,
  },
  'hljs-type': {
    color: COLORS.keyword,
  },
  'hljs-variable': {
    color: COLORS.foreground,
  },
};

const markedStyles: MarkedStyles = StyleSheet.create({
  blockquote: {
    backgroundColor: COLORS.surface,
    borderLeftColor: COLORS.border,
    borderLeftWidth: 2,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  code: {
    backgroundColor: COLORS.codeSurface,
    minWidth: '100%',
  },
  codespan: {
    backgroundColor: COLORS.codeSurface,
    borderRadius: 4,
    color: COLORS.foreground,
    fontFamily: MONO_FONT,
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  em: {
    color: COLORS.foreground,
    fontSize: 15,
    fontStyle: 'italic',
    lineHeight: 24,
  },
  h1: {
    borderBottomColor: COLORS.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    color: COLORS.foreground,
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 27,
    marginBottom: 10,
    paddingBottom: 8,
  },
  h2: {
    color: COLORS.foreground,
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 25,
    marginBottom: 8,
    marginTop: 4,
  },
  h3: {
    color: COLORS.foreground,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 23,
    marginBottom: 6,
    marginTop: 2,
  },
  h4: {
    color: COLORS.foreground,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 6,
  },
  h5: {
    color: COLORS.foreground,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 6,
  },
  h6: {
    color: COLORS.mutedForeground,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
    marginBottom: 6,
  },
  hr: {
    borderBottomColor: COLORS.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    marginTop: 2,
  },
  li: {
    color: COLORS.foreground,
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 24,
  },
  link: {
    color: COLORS.foreground,
    fontSize: 15,
    lineHeight: 24,
    textDecorationLine: 'underline',
  },
  list: {
    marginBottom: 12,
  },
  paragraph: {
    marginBottom: 12,
  },
  strikethrough: {
    color: COLORS.foreground,
    fontSize: 15,
    lineHeight: 24,
    textDecorationLine: 'line-through',
  },
  strong: {
    color: COLORS.foreground,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 24,
  },
  table: {
    borderColor: COLORS.border,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
    overflow: 'hidden',
  },
  tableCell: {
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  tableRow: {
    flexDirection: 'row',
  },
  text: {
    color: COLORS.foreground,
    fontSize: 15,
    lineHeight: 24,
  },
});

class NovaMarkdownRenderer extends Renderer {
  constructor(
    private readonly onCopyCode: (code: string) => void,
    private readonly onImagePress: (uri: string) => void
  ) {
    super();
  }

  image(href: string, alt?: string, _style?: unknown, _title?: string): ReactNode {
    return (
      <Pressable
        key={this.getKey()}
        onPress={() => this.onImagePress(href)}
        style={renderStyles.inlineImageContainer}
      >
        <Image
          source={{ uri: href }}
          style={renderStyles.inlineImage}
          resizeMode="cover"
        />
      </Pressable>
    );
  }

  paragraph(children: ReactNode[], styles?: ViewStyle): ReactNode {
    return (
      <View key={this.getKey()} style={styles}>
        {children}
      </View>
    );
  }

  blockquote(children: ReactNode[], styles?: ViewStyle): ReactNode {
    return (
      <View key={this.getKey()} style={styles}>
        {children}
      </View>
    );
  }

  heading(text: string | ReactNode[], styles?: TextStyle, depth?: number): ReactNode {
    return (
      <Text selectable accessibilityRole="header" key={this.getKey()} style={styles}>
        {text}
      </Text>
    );
  }

  code(text: string, language?: string): ReactNode {
    return (
      <MarkdownCodeBlock
        key={this.getKey()}
        code={text}
        language={language}
        onCopy={this.onCopyCode}
      />
    );
  }

  hr(styles?: ViewStyle): ReactNode {
    return <View key={this.getKey()} style={styles} />;
  }

  listItem(children: ReactNode[], styles?: ViewStyle): ReactNode {
    return (
      <View key={this.getKey()} style={styles}>
        {children}
      </View>
    );
  }

  list(
    ordered: boolean,
    li: ReactNode[],
    listStyle?: ViewStyle,
    _textStyle?: TextStyle,
    startIndex = 1
  ): ReactNode {
    return (
      <View key={this.getKey()} style={[renderStyles.list, listStyle]}>
        {li.map((item, index) => (
          <View key={`item-${index}`} style={renderStyles.listRow}>
            <Text style={renderStyles.listMarker}>
              {ordered ? `${startIndex + index}.` : '\u2022'}
            </Text>
            <View style={renderStyles.listContent}>{item}</View>
          </View>
        ))}
      </View>
    );
  }

  escape(text: string, styles?: TextStyle): ReactNode {
    return this.text(text, styles);
  }

  link(
    children: string | ReactNode[],
    href: string,
    styles?: TextStyle,
    title?: string
  ): ReactNode {
    return (
      <Text
        selectable
        accessibilityHint={title || 'Opens link'}
        accessibilityRole="link"
        key={this.getKey()}
        onPress={() => {
          Linking.openURL(href).catch(() => undefined);
        }}
        style={styles}
      >
        {children}
      </Text>
    );
  }

  strong(children: string | ReactNode[], styles?: TextStyle): ReactNode {
    return (
      <Text selectable key={this.getKey()} style={styles}>
        {children}
      </Text>
    );
  }

  em(children: string | ReactNode[], styles?: TextStyle): ReactNode {
    return (
      <Text selectable key={this.getKey()} style={styles}>
        {children}
      </Text>
    );
  }

  codespan(text: string, styles?: TextStyle): ReactNode {
    return (
      <Text selectable key={this.getKey()} style={styles}>
        {text}
      </Text>
    );
  }

  br(): ReactNode {
    return (
      <Text selectable key={this.getKey()} style={markedStyles.text}>
        {'\n'}
      </Text>
    );
  }

  del(children: string | ReactNode[], styles?: TextStyle): ReactNode {
    return (
      <Text selectable key={this.getKey()} style={styles}>
        {children}
      </Text>
    );
  }

  text(text: string | ReactNode[], styles?: TextStyle): ReactNode {
    return (
      <Text selectable key={this.getKey()} style={styles}>
        {text}
      </Text>
    );
  }

  html(text: string | ReactNode[], styles?: TextStyle): ReactNode {
    return this.text(text, styles);
  }

  table(
    header: ReactNode[][],
    rows: ReactNode[][][],
    tableStyle?: ViewStyle,
    rowStyle?: ViewStyle,
    cellStyle?: ViewStyle
  ): ReactNode {
    const columnCount = Math.max(
      header.length,
      ...rows.map((row) => row.length),
      1
    );
    const minWidth = Math.max(columnCount * 112, 240);

    return (
      <ScrollView
        horizontal
        key={this.getKey()}
        showsHorizontalScrollIndicator={false}
        style={renderStyles.tableScroller}
      >
        <View style={[renderStyles.table, tableStyle, { minWidth }]}>
          <View style={[renderStyles.tableRow, renderStyles.tableHeaderRow, rowStyle]}>
            {Array.from({ length: columnCount }).map((_, index) => (
              <View
                key={`header-${index}`}
                style={[renderStyles.tableCell, renderStyles.tableHeaderCell, cellStyle]}
              >
                {header[index]}
              </View>
            ))}
          </View>
          {rows.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={[renderStyles.tableRow, rowStyle]}>
              {Array.from({ length: columnCount }).map((_, cellIndex) => (
                <View
                  key={`cell-${rowIndex}-${cellIndex}`}
                  style={[
                    renderStyles.tableCell,
                    rowIndex % 2 === 1 && renderStyles.tableCellAlt,
                    cellStyle,
                  ]}
                >
                  {row[cellIndex]}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }
}

function MarkdownCodeBlock({
  code,
  language,
  onCopy,
}: {
  code: string;
  language?: string;
  onCopy: (code: string) => void;
}) {
  const displayLanguage = getDisplayLanguage(language);
  const highlighterLanguage = getHighlighterLanguage(language);

  const handleSaveFile = async () => {
    const extension = LANGUAGE_EXTENSIONS[displayLanguage] || 'txt';
    const fileName = `code.${extension}`;
    const destFile = new FSFile(Paths.document, fileName);
    try {
      destFile.write(code, { encoding: 'utf8' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(destFile.uri, { mimeType: 'text/plain', dialogTitle: 'Save code file' });
      }
    } catch {
      // Ignore errors
    }
  };

  return (
    <View style={renderStyles.codeBlock}>
      <View style={renderStyles.codeHeader}>
        <Text selectable style={renderStyles.codeLanguage}>
          {displayLanguage}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            accessibilityLabel={`Save ${displayLanguage} code as file`}
            accessibilityRole="button"
            hitSlop={8}
            onPress={handleSaveFile}
            style={renderStyles.copyButton}
          >
            <Download size={15} color={COLORS.subtle} strokeWidth={2} />
          </Pressable>
          <Pressable
            accessibilityLabel={`Copy ${displayLanguage} code`}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => onCopy(code)}
            style={renderStyles.copyButton}
          >
            <Copy size={15} color={COLORS.subtle} strokeWidth={2} />
          </Pressable>
        </View>
      </View>
      <View style={renderStyles.codeBody}>
        <SyntaxHighlighter
          fontFamily={MONO_FONT}
          fontSize={13}
          highlighter="highlightjs"
          language={highlighterLanguage}
          style={syntaxStyle}
          PreTag={ScrollView}
          CodeTag={Text}
        >
          {code}
        </SyntaxHighlighter>
      </View>
    </View>
  );
}

export function MarkdownMessage({ content, isStreaming = false }: MarkdownMessageProps) {
  const showToast = useUIStore((s) => s.showToast);
  const [imageViewerUri, setImageViewerUri] = useState<string | null>(null);

  const copyCode = useCallback(
    async (code: string) => {
      await Clipboard.setStringAsync(code);
      showToast('Copied to clipboard');
    },
    [showToast]
  );

  const handleImagePress = useCallback((uri: string) => {
    setImageViewerUri(uri);
  }, []);

  const handleCloseImageViewer = useCallback(() => {
    setImageViewerUri(null);
  }, []);

  const handleSaveImage = useCallback(async () => {
    if (!imageViewerUri) return;
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(imageViewerUri, { dialogTitle: 'Save image' });
      }
    } catch {
      // Ignore
    }
  }, [imageViewerUri]);

  const useStreamingPreview = isStreaming && content.length > 0;

  return (
    <>
      {useStreamingPreview ? (
        <StreamingMarkdownPreview content={content} />
      ) : (
        <ParsedMarkdownContent
          content={content}
          isStreaming={isStreaming}
          onCopyCode={copyCode}
          onImagePress={handleImagePress}
        />
      )}

      {/* Full-screen image viewer */}
      <Modal visible={!!imageViewerUri} transparent animationType="fade">
        <View style={renderStyles.imageViewerOverlay}>
          <Pressable style={renderStyles.imageViewerClose} onPress={handleCloseImageViewer}>
            <X size={24} color="#fff" />
          </Pressable>
          {imageViewerUri && (
            <Image
              source={{ uri: imageViewerUri }}
              style={renderStyles.imageViewerImage}
              resizeMode="contain"
            />
          )}
          <Pressable style={renderStyles.imageViewerSave} onPress={handleSaveImage}>
            <Download size={20} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

function ParsedMarkdownContent({
  content,
  isStreaming,
  onCopyCode,
  onImagePress,
}: ParsedMarkdownContentProps) {
  const renderedContent = useMemo(
    () => completeStreamingMarkdown(content, isStreaming),
    [content, isStreaming]
  );
  const renderer = useMemo(
    () => new NovaMarkdownRenderer(onCopyCode, onImagePress),
    [onCopyCode, onImagePress]
  );
  const elements = useMarkdown(renderedContent, {
    renderer,
    styles: markedStyles,
    theme: {
      colors: {
        border: COLORS.border,
        code: COLORS.codeSurface,
        link: COLORS.foreground,
        text: COLORS.foreground,
      },
      spacing: {
        xs: 4,
        s: 8,
        m: 12,
        l: 16,
      },
    },
  });

  return (
    <View style={renderStyles.markdownRoot}>
      {elements.map((element, index) => (
        <Fragment key={`markdown-${index}`}>{element}</Fragment>
      ))}
    </View>
  );
}

function StreamingMarkdownPreview({ content }: { content: string }) {
  const blocks = useMemo(() => parseStreamingBlocks(content), [content]);

  return (
    <View style={renderStyles.streamingRoot}>
      {blocks.map((block, index) =>
        block.type === 'code' ? (
          <StreamingCodeBlock block={block} key={`stream-code-${index}`} />
        ) : (
          <StreamingTextBlock key={`stream-text-${index}`} text={block.text} />
        )
      )}
    </View>
  );
}

function StreamingTextBlock({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <View style={renderStyles.streamingParagraph}>
      {lines.map((line, index) => {
        if (!line.trim()) {
          return <View key={`line-${index}`} style={renderStyles.streamingBreak} />;
        }

        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
          return (
            <Text key={`line-${index}`} selectable style={renderStyles.streamingHeading}>
              {heading[2]}
            </Text>
          );
        }

        const listItem = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
        if (listItem) {
          return (
            <View key={`line-${index}`} style={renderStyles.streamingListRow}>
              <Text selectable style={renderStyles.streamingListMarker}>
                {listItem[2].match(/\d/) ? listItem[2].replace(')', '.') : '\u2022'}
              </Text>
              <Text selectable style={renderStyles.streamingText}>
                {listItem[3]}
              </Text>
            </View>
          );
        }

        return (
          <Text key={`line-${index}`} selectable style={renderStyles.streamingText}>
            {line}
          </Text>
        );
      })}
    </View>
  );
}

function StreamingCodeBlock({ block }: { block: Extract<StreamingBlock, { type: 'code' }> }) {
  return (
    <View style={renderStyles.streamingCodeBlock}>
      <View style={renderStyles.streamingCodeHeader}>
        <Text selectable style={renderStyles.codeLanguage}>
          {block.language || 'text'}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={renderStyles.streamingCodeScroller}
      >
        <Text selectable style={renderStyles.streamingCodeText}>
          {block.code}
          {block.open ? '\n' : ''}
        </Text>
      </ScrollView>
    </View>
  );
}

function parseStreamingBlocks(content: string): StreamingBlock[] {
  const blocks: StreamingBlock[] = [];
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let textLines: string[] = [];
  let codeLines: string[] = [];
  let codeLanguage = 'text';
  let activeFence: string | null = null;

  const flushText = () => {
    if (textLines.length === 0) return;
    blocks.push({ type: 'text', text: textLines.join('\n') });
    textLines = [];
  };

  const flushCode = (open: boolean) => {
    blocks.push({
      type: 'code',
      language: codeLanguage,
      code: codeLines.join('\n'),
      open,
    });
    codeLines = [];
    codeLanguage = 'text';
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^ {0,3}(```+|~~~+)\s*([^`]*)?$/);

    if (fenceMatch) {
      const fenceMarker = fenceMatch[1].startsWith('~') ? '~~~' : '```';

      if (!activeFence) {
        flushText();
        activeFence = fenceMarker;
        codeLanguage = fenceMatch[2]?.trim().split(/\s+/)[0] || 'text';
        continue;
      }

      if (activeFence === fenceMarker) {
        flushCode(false);
        activeFence = null;
        continue;
      }
    }

    if (activeFence) {
      codeLines.push(line);
    } else {
      textLines.push(line);
    }
  }

  if (activeFence) {
    flushCode(true);
  } else {
    flushText();
  }

  return blocks;
}

function completeStreamingMarkdown(content: string, isStreaming: boolean) {
  if (!isStreaming || !content) {
    return content;
  }

  let activeFence: '```' | '~~~' | null = null;

  for (const line of content.split('\n')) {
    const match = line.match(/^ {0,3}(```+|~~~+)/);
    if (!match) {
      continue;
    }

    const marker = match[1].startsWith('~') ? '~~~' : '```';
    if (!activeFence) {
      activeFence = marker;
    } else if (activeFence === marker) {
      activeFence = null;
    }
  }

  if (!activeFence) {
    return content;
  }

  return content.endsWith('\n') ? `${content}${activeFence}` : `${content}\n${activeFence}`;
}

function getDisplayLanguage(language?: string) {
  const normalized = language?.trim().toLowerCase();
  return normalized || 'text';
}

function getHighlighterLanguage(language?: string) {
  const normalized = getDisplayLanguage(language);
  const aliased = LANGUAGE_ALIASES[normalized] ?? normalized;
  return SUPPORTED_LANGUAGES.has(aliased) ? aliased : undefined;
}

const renderStyles = StyleSheet.create({
  codeBlock: {
    backgroundColor: COLORS.codeSurface,
    borderColor: COLORS.border,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
    overflow: 'hidden',
  },
  codeBody: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  codeHeader: {
    alignItems: 'center',
    backgroundColor: COLORS.codeSurface,
    borderBottomColor: COLORS.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  codeLanguage: {
    color: COLORS.subtle,
    fontFamily: MONO_FONT,
    fontSize: 11,
    lineHeight: 16,
  },
  copyButton: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  list: {
    gap: 6,
  },
  listContent: {
    flex: 1,
    minWidth: 0,
  },
  listMarker: {
    color: COLORS.subtle,
    fontSize: 15,
    lineHeight: 24,
    marginRight: 8,
    minWidth: 18,
    textAlign: 'right',
  },
  listRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  markdownRoot: {
    width: '100%',
  },
  streamingBreak: {
    height: 10,
  },
  streamingCodeBlock: {
    backgroundColor: COLORS.codeSurface,
    borderColor: COLORS.border,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
    overflow: 'hidden',
  },
  streamingCodeHeader: {
    alignItems: 'center',
    backgroundColor: COLORS.codeSurface,
    borderBottomColor: COLORS.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  streamingCodeScroller: {
    maxWidth: '100%',
  },
  streamingCodeText: {
    color: COLORS.foreground,
    fontFamily: MONO_FONT,
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  streamingHeading: {
    color: COLORS.foreground,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 23,
    marginBottom: 6,
  },
  streamingListMarker: {
    color: COLORS.subtle,
    fontSize: 15,
    lineHeight: 24,
    marginRight: 8,
    minWidth: 18,
    textAlign: 'right',
  },
  streamingListRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  streamingParagraph: {
    marginBottom: 12,
  },
  streamingRoot: {
    width: '100%',
  },
  streamingText: {
    color: COLORS.foreground,
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 24,
  },
  table: {
    backgroundColor: COLORS.codeSurface,
  },
  tableCell: {
    borderBottomColor: COLORS.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRightColor: COLORS.border,
    borderRightWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minWidth: 112,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  tableCellAlt: {
    backgroundColor: COLORS.surface,
  },
  tableHeaderCell: {
    backgroundColor: COLORS.codeSurface,
  },
  tableHeaderRow: {
    borderBottomColor: COLORS.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableScroller: {
    marginBottom: 16,
    maxWidth: '100%',
  },
  inlineImageContainer: {
    marginBottom: 12,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    maxWidth: 280,
  },
  inlineImage: {
    width: 280,
    height: 200,
    borderRadius: 8,
  },
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageViewerClose: {
    position: 'absolute',
    top: 48,
    right: 16,
    padding: 8,
    zIndex: 10,
  },
  imageViewerSave: {
    position: 'absolute',
    bottom: 48,
    right: 16,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 24,
  },
  imageViewerImage: {
    width: '100%',
    height: '80%',
  },
});
