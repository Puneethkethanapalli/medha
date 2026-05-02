import React, {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Paths, File as FSFile } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Check, Copy, Download, Maximize2, Minimize2, X } from 'lucide-react-native';
import SyntaxHighlighter from 'react-native-syntax-highlighter';
import { Renderer, useMarkdown, type MarkedStyles } from 'react-native-marked';
import { useSettingsStore } from '@/stores/settings-store';
import { useUIStore } from '@/stores/ui-store';
import type { Theme } from '@/lib/storage/mmkv';

interface MarkdownMessageProps {
  content: string;
  isStreaming?: boolean;
}

interface ParsedMarkdownContentProps {
  content: string;
  isStreaming: boolean;
  onCopyCode: (code: string) => Promise<void>;
  onImagePress: (uri: string) => void;
  styles: MarkdownStyleBundle;
}

type MarkdownPalette = {
  background: string;
  foreground: string;
  mutedForeground: string;
  subtle: string;
  surface: string;
  surfaceAlt: string;
  codeSurface: string;
  codeSurfaceAlt: string;
  border: string;
  link: string;
  overlay: string;
  keyword: string;
  string: string;
  comment: string;
  function: string;
  number: string;
  operator: string;
};

type SyntaxStyle = Record<string, TextStyle | ViewStyle | Record<string, unknown>>;

type MarkdownStyleBundle = {
  colors: MarkdownPalette;
  markedStyles: MarkedStyles;
  renderStyles: MarkdownRenderStyles;
  syntaxStyle: SyntaxStyle;
};

type MarkdownRenderStyles = ReturnType<typeof createRenderStyles>;

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
  zsh: 'bash',
};

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  bash: 'sh',
  c: 'c',
  cpp: 'cpp',
  csharp: 'cs',
  css: 'css',
  dart: 'dart',
  diff: 'diff',
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

const MARKDOWN_PALETTES: Record<Theme, MarkdownPalette> = {
  light: {
    background: '#FFFFFF',
    foreground: '#18181B',
    mutedForeground: '#52525B',
    subtle: '#71717A',
    surface: '#F4F4F5',
    surfaceAlt: '#FAFAFA',
    codeSurface: '#F4F4F5',
    codeSurfaceAlt: '#FFFFFF',
    border: '#E4E4E7',
    link: '#111827',
    overlay: 'rgba(255,255,255,0.96)',
    keyword: '#7C3AED',
    string: '#15803D',
    comment: '#71717A',
    function: '#2563EB',
    number: '#B45309',
    operator: '#52525B',
  },
  dark: {
    background: '#09090B',
    foreground: '#FAFAFA',
    mutedForeground: '#A1A1AA',
    subtle: '#71717A',
    surface: '#0A0A0C',
    surfaceAlt: '#111113',
    codeSurface: '#18181B',
    codeSurfaceAlt: '#101012',
    border: '#27272A',
    link: '#FAFAFA',
    overlay: 'rgba(9,9,11,0.96)',
    keyword: '#C084FC',
    string: '#86EFAC',
    comment: '#71717A',
    function: '#93C5FD',
    number: '#FDE68A',
    operator: '#A1A1AA',
  },
  oled: {
    background: '#000000',
    foreground: '#FFFFFF',
    mutedForeground: '#B3B3B3',
    subtle: '#808080',
    surface: '#050505',
    surfaceAlt: '#0A0A0A',
    codeSurface: '#0D0D0D',
    codeSurfaceAlt: '#050505',
    border: '#242424',
    link: '#FFFFFF',
    overlay: 'rgba(0,0,0,0.96)',
    keyword: '#C084FC',
    string: '#86EFAC',
    comment: '#808080',
    function: '#93C5FD',
    number: '#FDE68A',
    operator: '#B3B3B3',
  },
};

class NovaMarkdownRenderer extends Renderer {
  constructor(
    private readonly onCopyCode: (code: string) => Promise<void>,
    private readonly onImagePress: (uri: string) => void,
    private readonly styles: MarkdownStyleBundle,
    private readonly isStreaming: boolean
  ) {
    super();
  }

  image(href: string, alt?: string, _style?: unknown, _title?: string): ReactNode {
    return (
      <Pressable
        accessibilityLabel={alt || 'Open image'}
        accessibilityRole="button"
        key={this.getKey()}
        onPress={() => this.onImagePress(href)}
        style={this.styles.renderStyles.inlineImageContainer}
      >
        <Image
          source={{ uri: href }}
          style={this.styles.renderStyles.inlineImage}
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
        <View style={this.styles.renderStyles.blockquoteContent}>
          {applyTextStyle(children, this.styles.renderStyles.blockquoteText)}
        </View>
      </View>
    );
  }

  heading(text: string | ReactNode[], styles?: TextStyle): ReactNode {
    return (
      <Text selectable accessibilityRole="header" key={this.getKey()} style={styles}>
        {text}
      </Text>
    );
  }

  code(text: string, language?: string): ReactNode {
    return (
      <MarkdownCodeBlock
        code={text}
        colors={this.styles.colors}
        isStreaming={this.isStreaming}
        key={this.getKey()}
        language={language}
        onCopy={this.onCopyCode}
        renderStyles={this.styles.renderStyles}
        syntaxStyle={this.styles.syntaxStyle}
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
      <View key={this.getKey()} style={[this.styles.renderStyles.list, listStyle]}>
        {li.map((item, index) => (
          <View key={`item-${index}`} style={this.styles.renderStyles.listRow}>
            <Text selectable style={this.styles.renderStyles.listMarker}>
              {ordered ? `${startIndex + index}.` : '\u2022'}
            </Text>
            <View style={this.styles.renderStyles.listContent}>
              {applyTextStyle(item, this.styles.renderStyles.listText)}
            </View>
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
        accessibilityHint={title || href}
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
      <Text selectable key={this.getKey()} style={this.styles.markedStyles.text}>
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
    const columnCount = Math.max(header.length, ...rows.map((row) => row.length), 1);
    const minWidth = Math.max(columnCount * 132, 280);

    return (
      <ScrollView
        horizontal
        key={this.getKey()}
        nestedScrollEnabled
        showsHorizontalScrollIndicator
        style={this.styles.renderStyles.tableScroller}
      >
        <View style={[this.styles.renderStyles.table, tableStyle, { minWidth }]}>
          <View style={[this.styles.renderStyles.tableRow, this.styles.renderStyles.tableHeaderRow, rowStyle]}>
            {Array.from({ length: columnCount }).map((_, index) => (
              <View
                key={`header-${index}`}
                style={[this.styles.renderStyles.tableCell, this.styles.renderStyles.tableHeaderCell, cellStyle]}
              >
                {applyTextStyle(header[index] ?? null, this.styles.renderStyles.tableHeaderText)}
              </View>
            ))}
          </View>
          {rows.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={[this.styles.renderStyles.tableRow, rowStyle]}>
              {Array.from({ length: columnCount }).map((_, cellIndex) => (
                <View
                  key={`cell-${rowIndex}-${cellIndex}`}
                  style={[
                    this.styles.renderStyles.tableCell,
                    rowIndex % 2 === 1 && this.styles.renderStyles.tableCellAlt,
                    cellStyle,
                  ]}
                >
                  {applyTextStyle(row[cellIndex] ?? null, this.styles.renderStyles.tableCellText)}
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
  colors,
  isStreaming,
  language,
  onCopy,
  renderStyles,
  syntaxStyle,
}: {
  code: string;
  colors: MarkdownPalette;
  isStreaming: boolean;
  language?: string;
  onCopy: (code: string) => Promise<void>;
  renderStyles: MarkdownRenderStyles;
  syntaxStyle: SyntaxStyle;
}) {
  const displayLanguage = getDisplayLanguage(language);
  const highlighterLanguage = getHighlighterLanguage(language);
  const lineCount = code.length === 0 ? 1 : code.split('\n').length;
  const isLong = lineCount > 18 || code.length > 1800;
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(!isLong);

  useEffect(() => {
    setExpanded(!isLong);
  }, [isLong, code]);

  useEffect(() => {
    if (!copied) return undefined;
    const timeout = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timeout);
  }, [copied]);

  const handleCopy = useCallback(async () => {
    await onCopy(code);
    setCopied(true);
    if (Platform.OS === 'ios') {
      Haptics.selectionAsync().catch(() => undefined);
    }
  }, [code, onCopy]);

  const handleSaveFile = useCallback(async () => {
    const extension = getFileExtension(language);
    const fileName = `code-${Date.now()}.${extension}`;
    const destFile = new FSFile(Paths.document, fileName);
    try {
      destFile.write(code, { encoding: 'utf8' });
      if (Platform.OS === 'ios') {
        Haptics.selectionAsync().catch(() => undefined);
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(destFile.uri, {
          mimeType: 'text/plain',
          dialogTitle: 'Save code file',
        });
      }
    } catch {
      // Sharing is best-effort; the message copy action remains available.
    }
  }, [code, language]);

  const shouldClamp = isLong && !expanded && !isStreaming;
  const CopyIcon = copied ? Check : Copy;

  return (
    <View style={renderStyles.codeBlock}>
      <View style={renderStyles.codeHeader}>
        <Text selectable style={renderStyles.codeLanguage}>
          {displayLanguage}
        </Text>
        <View style={renderStyles.codeActions}>
          {isLong && !isStreaming && (
            <Pressable
              accessibilityLabel={expanded ? 'Collapse code block' : 'Expand code block'}
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setExpanded((current) => !current)}
              style={renderStyles.codeButton}
            >
              {expanded ? (
                <Minimize2 size={15} color={colors.subtle} strokeWidth={2} />
              ) : (
                <Maximize2 size={15} color={colors.subtle} strokeWidth={2} />
              )}
            </Pressable>
          )}
          <Pressable
            accessibilityLabel={`Save ${displayLanguage} code as file`}
            accessibilityRole="button"
            hitSlop={8}
            onPress={handleSaveFile}
            style={renderStyles.codeButton}
          >
            <Download size={15} color={colors.subtle} strokeWidth={2} />
          </Pressable>
          <Pressable
            accessibilityLabel={copied ? `${displayLanguage} code copied` : `Copy ${displayLanguage} code`}
            accessibilityRole="button"
            hitSlop={8}
            onPress={handleCopy}
            style={renderStyles.codeButton}
          >
            <CopyIcon size={15} color={copied ? colors.foreground : colors.subtle} strokeWidth={2} />
          </Pressable>
        </View>
      </View>
      <View style={[renderStyles.codeBody, shouldClamp && renderStyles.codeBodyCollapsed]}>
        <SyntaxHighlighter
          CodeTag={Text}
          PreTag={ScrollView}
          customStyle={renderStyles.syntaxHighlighter}
          fontFamily={MONO_FONT}
          fontSize={13}
          highlighter="highlightjs"
          language={highlighterLanguage}
          style={syntaxStyle}
          wrapLongLines={false}
        >
          {code}
        </SyntaxHighlighter>
      </View>
      {shouldClamp && (
        <View pointerEvents="none" style={renderStyles.codeFade} />
      )}
    </View>
  );
}

export function MarkdownMessage({ content, isStreaming = false }: MarkdownMessageProps) {
  const showToast = useUIStore((s) => s.showToast);
  const theme = useSettingsStore((s) => s.theme);
  const { width } = useWindowDimensions();
  const [imageViewerUri, setImageViewerUri] = useState<string | null>(null);

  const styles = useMemo(() => createMarkdownStyleBundle(theme, width), [theme, width]);

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
      if (Platform.OS === 'ios') {
        Haptics.selectionAsync().catch(() => undefined);
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(imageViewerUri, { dialogTitle: 'Save image' });
      }
    } catch {
      // Image sharing depends on the URI type and platform support.
    }
  }, [imageViewerUri]);

  return (
    <>
      <ParsedMarkdownContent
        content={content}
        isStreaming={isStreaming}
        onCopyCode={copyCode}
        onImagePress={handleImagePress}
        styles={styles}
      />

      <Modal
        animationType="fade"
        onRequestClose={handleCloseImageViewer}
        transparent
        visible={!!imageViewerUri}
      >
        <View style={styles.renderStyles.imageViewerOverlay}>
          <Pressable
            accessibilityLabel="Close image preview"
            accessibilityRole="button"
            style={styles.renderStyles.imageViewerClose}
            onPress={handleCloseImageViewer}
          >
            <X size={24} color="#fff" />
          </Pressable>
          {imageViewerUri && (
            <Image
              source={{ uri: imageViewerUri }}
              style={styles.renderStyles.imageViewerImage}
              resizeMode="contain"
            />
          )}
          <Pressable
            accessibilityLabel="Save image"
            accessibilityRole="button"
            style={styles.renderStyles.imageViewerSave}
            onPress={handleSaveImage}
          >
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
  styles,
}: ParsedMarkdownContentProps) {
  const renderedContent = useMemo(
    () => completeStreamingMarkdown(content, isStreaming),
    [content, isStreaming]
  );
  const renderer = useMemo(
    () => new NovaMarkdownRenderer(onCopyCode, onImagePress, styles, isStreaming),
    [isStreaming, onCopyCode, onImagePress, styles]
  );
  const elements = useMarkdown(renderedContent, {
    renderer,
    styles: styles.markedStyles,
    theme: {
      colors: {
        border: styles.colors.border,
        code: styles.colors.codeSurface,
        link: styles.colors.link,
        text: styles.colors.foreground,
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
    <View style={styles.renderStyles.markdownRoot}>
      {elements.map((element, index) => (
        <Fragment key={`markdown-${index}`}>{element}</Fragment>
      ))}
    </View>
  );
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

function getFileExtension(language?: string) {
  const normalized = getDisplayLanguage(language);
  const aliased = LANGUAGE_ALIASES[normalized] ?? normalized;
  return LANGUAGE_EXTENSIONS[aliased] || LANGUAGE_EXTENSIONS[normalized] || 'txt';
}

function createMarkdownStyleBundle(theme: Theme, windowWidth: number): MarkdownStyleBundle {
  const colors = MARKDOWN_PALETTES[theme] ?? MARKDOWN_PALETTES.dark;

  return {
    colors,
    markedStyles: createMarkedStyles(colors),
    renderStyles: createRenderStyles(colors, windowWidth),
    syntaxStyle: createSyntaxStyle(colors),
  };
}

function createSyntaxStyle(colors: MarkdownPalette): SyntaxStyle {
  return {
    hljs: {
      background: colors.codeSurface,
      color: colors.foreground,
    },
    'hljs-addition': {
      color: colors.string,
    },
    'hljs-attr': {
      color: colors.function,
    },
    'hljs-built_in': {
      color: colors.function,
    },
    'hljs-bullet': {
      color: colors.operator,
    },
    'hljs-comment': {
      color: colors.comment,
      fontStyle: 'italic',
    },
    'hljs-deletion': {
      color: '#FCA5A5',
    },
    'hljs-keyword': {
      color: colors.keyword,
    },
    'hljs-literal': {
      color: colors.keyword,
    },
    'hljs-name': {
      color: colors.function,
    },
    'hljs-number': {
      color: colors.number,
    },
    'hljs-operator': {
      color: colors.operator,
    },
    'hljs-params': {
      color: colors.foreground,
    },
    'hljs-property': {
      color: colors.function,
    },
    'hljs-section': {
      color: colors.function,
    },
    'hljs-string': {
      color: colors.string,
    },
    'hljs-title': {
      color: colors.function,
    },
    'hljs-type': {
      color: colors.keyword,
    },
    'hljs-variable': {
      color: colors.foreground,
    },
  };
}

function createMarkedStyles(colors: MarkdownPalette): MarkedStyles {
  return StyleSheet.create({
    blockquote: {
      backgroundColor: colors.surface,
      borderLeftColor: colors.border,
      borderLeftWidth: 2,
      marginBottom: 14,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    code: {
      backgroundColor: colors.codeSurface,
      minWidth: '100%',
    },
    codespan: {
      backgroundColor: colors.codeSurface,
      borderColor: colors.border,
      borderRadius: 5,
      borderWidth: StyleSheet.hairlineWidth,
      color: colors.foreground,
      fontFamily: MONO_FONT,
      fontSize: 13,
      lineHeight: 20,
      paddingHorizontal: 5,
      paddingVertical: 2,
    },
    em: {
      color: colors.foreground,
      fontSize: 15,
      fontStyle: 'italic',
      lineHeight: 24,
    },
    h1: {
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      color: colors.foreground,
      fontSize: 21,
      fontWeight: '700',
      lineHeight: 29,
      marginBottom: 12,
      marginTop: 4,
      paddingBottom: 9,
    },
    h2: {
      color: colors.foreground,
      fontSize: 18,
      fontWeight: '700',
      lineHeight: 26,
      marginBottom: 9,
      marginTop: 5,
    },
    h3: {
      color: colors.foreground,
      fontSize: 16,
      fontWeight: '700',
      lineHeight: 24,
      marginBottom: 7,
      marginTop: 3,
    },
    h4: {
      color: colors.foreground,
      fontSize: 15,
      fontWeight: '700',
      lineHeight: 23,
      marginBottom: 6,
      marginTop: 2,
    },
    h5: {
      color: colors.foreground,
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 23,
      marginBottom: 6,
    },
    h6: {
      color: colors.mutedForeground,
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 22,
      marginBottom: 6,
    },
    hr: {
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      marginBottom: 14,
      marginTop: 2,
    },
    li: {
      color: colors.foreground,
      flexShrink: 1,
      fontSize: 15,
      lineHeight: 24,
    },
    link: {
      color: colors.link,
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 24,
      textDecorationColor: colors.subtle,
      textDecorationLine: 'underline',
    },
    list: {
      marginBottom: 13,
    },
    paragraph: {
      marginBottom: 12,
    },
    strikethrough: {
      color: colors.foreground,
      fontSize: 15,
      lineHeight: 24,
      textDecorationLine: 'line-through',
    },
    strong: {
      color: colors.foreground,
      fontSize: 15,
      fontWeight: '700',
      lineHeight: 24,
    },
    table: {},
    tableCell: {},
    tableRow: {
      flexDirection: 'row',
    },
    text: {
      color: colors.foreground,
      fontSize: 15,
      lineHeight: 24,
    },
  });
}

function createRenderStyles(colors: MarkdownPalette, windowWidth: number) {
  const imageWidth = Math.min(Math.max(windowWidth - 112, 208), 340);

  return StyleSheet.create({
    blockquoteContent: {
      gap: 2,
    },
    blockquoteText: {
      color: colors.mutedForeground,
      fontStyle: 'italic',
    },
    codeActions: {
      flexDirection: 'row',
      gap: 4,
    },
    codeBlock: {
      backgroundColor: colors.codeSurface,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: 16,
      overflow: 'hidden',
    },
    codeBody: {
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    codeBodyCollapsed: {
      maxHeight: 360,
      overflow: 'hidden',
    },
    codeButton: {
      alignItems: 'center',
      borderRadius: 7,
      height: 30,
      justifyContent: 'center',
      width: 30,
    },
    codeFade: {
      backgroundColor: colors.codeSurface,
      borderTopColor: colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      bottom: 0,
      height: 22,
      left: 0,
      opacity: 0.9,
      position: 'absolute',
      right: 0,
    },
    codeHeader: {
      alignItems: 'center',
      backgroundColor: colors.codeSurface,
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 42,
      paddingLeft: 12,
      paddingRight: 6,
    },
    codeLanguage: {
      color: colors.subtle,
      fontFamily: MONO_FONT,
      fontSize: 11,
      lineHeight: 16,
      textTransform: 'lowercase',
    },
    imageViewerClose: {
      padding: 8,
      position: 'absolute',
      right: 16,
      top: 48,
      zIndex: 10,
    },
    imageViewerImage: {
      height: '80%',
      width: '100%',
    },
    imageViewerOverlay: {
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.95)',
      flex: 1,
      justifyContent: 'center',
    },
    imageViewerSave: {
      backgroundColor: 'rgba(255,255,255,0.15)',
      borderRadius: 24,
      bottom: 48,
      padding: 12,
      position: 'absolute',
      right: 16,
    },
    inlineImage: {
      aspectRatio: 4 / 3,
      borderRadius: 10,
      width: imageWidth,
    },
    inlineImageContainer: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: 14,
      maxWidth: imageWidth,
      overflow: 'hidden',
    },
    list: {
      gap: 6,
    },
    listContent: {
      flex: 1,
      minWidth: 0,
    },
    listMarker: {
      color: colors.subtle,
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
    listText: {
      color: colors.foreground,
      fontSize: 15,
      lineHeight: 24,
    },
    markdownRoot: {
      width: '100%',
    },
    syntaxHighlighter: {
      backgroundColor: colors.codeSurface,
    },
    table: {
      backgroundColor: colors.codeSurfaceAlt,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
    },
    tableCell: {
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderRightColor: colors.border,
      borderRightWidth: StyleSheet.hairlineWidth,
      flex: 1,
      minWidth: 132,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    tableCellAlt: {
      backgroundColor: colors.surface,
    },
    tableCellText: {
      color: colors.foreground,
      fontSize: 14,
      lineHeight: 21,
    },
    tableHeaderCell: {
      backgroundColor: colors.codeSurface,
    },
    tableHeaderRow: {
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    tableHeaderText: {
      color: colors.mutedForeground,
      fontSize: 13,
      fontWeight: '700',
      lineHeight: 19,
    },
    tableRow: {
      flexDirection: 'row',
    },
    tableScroller: {
      marginBottom: 16,
      maxWidth: '100%',
    },
  });
}

function applyTextStyle(children: ReactNode, style: TextStyle): ReactNode {
  if (Array.isArray(children)) {
    return children.map((child, index) => (
      <Fragment key={`styled-${index}`}>{applyTextStyle(child, style)}</Fragment>
    ));
  }

  if (!React.isValidElement(children)) {
    return children;
  }

  const element = children as ReactElement<{
    children?: ReactNode;
    style?: unknown;
  }>;
  const nextProps: {
    children?: ReactNode;
    style?: unknown;
  } = {};

  if (element.props.children !== undefined) {
    nextProps.children = applyTextStyle(element.props.children, style);
  }

  if (element.type === Text) {
    nextProps.style = [element.props.style, style];
  }

  return React.cloneElement(element, nextProps);
}
