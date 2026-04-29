/**
 * Seed built-in apps — Sprint 20
 *
 * Ships 5 practical apps as built-in templates.
 * On first launch: inserts rows with builtin=1.
 * On subsequent launches: skips if already seeded.
 */

import { addApp, getAppByName } from '../db/apps';

interface BuiltinAppDef {
  name: string;
  description: string;
  icon: string;
  color: string;
  skillName: string | null;
  model: string | null;
  provider: string | null;
  rules: string | null;
  greeting: string | null;
  examplePrompts: string[];
}

const BUILTIN_APPS: BuiltinAppDef[] = [
  {
    name: 'Medha Default',
    description: 'General-purpose AI assistant with no pinned model or skill',
    icon: 'Sparkles',
    color: 'hsl(0, 0%, 63%)',
    skillName: null,
    model: null,
    provider: null,
    rules: null,
    greeting: null,
    examplePrompts: [
      'Help me debug a React component',
      'Summarize a long document',
      'Brainstorm startup ideas',
      'Translate text to Spanish',
    ],
  },
  {
    name: 'Code Assistant',
    description: 'Code review, debugging, and programming help',
    icon: 'Code',
    color: 'hsl(265, 80%, 60%)',
    skillName: 'code-review',
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    rules: null,
    greeting: 'Share your code and I\'ll review it for bugs, security issues, performance, and style.',
    examplePrompts: [
      'Review this React component',
      'Find the bug in my function',
      'Optimize this SQL query',
      'Explain this error message',
    ],
  },
  {
    name: 'Writing Coach',
    description: 'Creative writing, editing, and content improvement',
    icon: 'Feather',
    color: 'hsl(35, 90%, 55%)',
    skillName: null,
    model: null,
    provider: null,
    rules: 'You are a thoughtful writing coach. Help with creative writing, editing, and content improvement. Focus on clarity, tone, and engagement. Suggest structural improvements and word choices. Be encouraging but honest about areas that need work.',
    greeting: 'What would you like to write today?',
    examplePrompts: [
      'Help me write a blog post',
      'Improve this paragraph',
      'Write a compelling opening',
      'Suggest a better headline',
    ],
  },
  {
    name: 'Language Tutor',
    description: 'Language learning, translation, and grammar correction',
    icon: 'Languages',
    color: 'hsl(160, 70%, 45%)',
    skillName: 'translate-document',
    model: null,
    provider: null,
    rules: 'Always correct grammar mistakes. Explain the correction briefly. When translating, provide context about formality levels and regional variations.',
    greeting: 'Which language are you learning? I can help with translation, grammar, and practice conversations.',
    examplePrompts: [
      'Translate this to French',
      'Correct my Spanish grammar',
      'Teach me common Japanese phrases',
      'Explain this German word',
    ],
  },
  {
    name: 'Research Pro',
    description: 'Deep research and systematic investigation with web search',
    icon: 'Search',
    color: 'hsl(210, 80%, 55%)',
    skillName: 'research',
    model: null,
    provider: null,
    rules: null,
    greeting: 'What topic would you like me to research? I\'ll search the web and provide a thorough analysis.',
    examplePrompts: [
      'Research the latest in AI safety',
      'Compare React vs Vue in 2026',
      'Find studies on intermittent fasting',
      'Investigate this company',
    ],
  },
];

/**
 * Seed built-in apps on first launch.
 * Idempotent — checks if each app already exists by name before inserting.
 */
export function seedBuiltinApps(): void {
  for (const def of BUILTIN_APPS) {
    const existing = getAppByName(def.name);
    if (existing) continue;

    addApp(def.name, def.description, def.icon, {
      color: def.color,
      skillName: def.skillName ?? undefined,
      model: def.model ?? undefined,
      provider: def.provider ?? undefined,
      rules: def.rules ?? undefined,
      greeting: def.greeting ?? undefined,
      examplePrompts: def.examplePrompts.length > 0 ? def.examplePrompts : undefined,
      builtin: true,
    });
  }
}
