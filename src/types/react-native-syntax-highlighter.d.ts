declare module 'react-native-syntax-highlighter' {
  import type { ComponentType } from 'react';
  import type { TextStyle, ViewStyle } from 'react-native';

  export interface SyntaxHighlighterProps {
    children: string;
    language?: string;
    style?: Record<string, TextStyle | ViewStyle | Record<string, string>>;
    highlighter?: 'highlightjs' | 'hljs' | 'prism' | string;
    fontFamily?: string;
    fontSize?: number;
    customStyle?: ViewStyle;
    textStyle?: TextStyle;
    PreTag?: ComponentType<any>;
    CodeTag?: ComponentType<any>;
    [key: string]: unknown;
  }

  const SyntaxHighlighter: ComponentType<SyntaxHighlighterProps>;

  export default SyntaxHighlighter;
}
