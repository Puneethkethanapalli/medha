/**
 * Dynamic icon lookup — Sprint 20
 *
 * Maps icon name strings (from app config) to lucide-react-native components.
 * Only includes icons used by the app system to keep the bundle small.
 */

import {
  Sparkles,
  Code,
  Feather,
  Languages,
  Search,
  Bot,
  BookOpen,
  Brain,
  Brush,
  Calculator,
  FileText,
  Globe,
  Heart,
  Lightbulb,
  MessageCircle,
  Music,
  Palette,
  Rocket,
  Shield,
  Star,
  Terminal,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';

const ICON_MAP: Record<string, LucideIcon> = {
  Sparkles,
  Code,
  Feather,
  Languages,
  Search,
  Bot,
  BookOpen,
  Brain,
  Brush,
  Calculator,
  FileText,
  Globe,
  Heart,
  Lightbulb,
  MessageCircle,
  Music,
  Palette,
  Rocket,
  Shield,
  Star,
  Terminal,
  Wrench,
  Zap,
};

/** Get a lucide icon component by name. Falls back to Bot if not found. */
export function getIconByName(name: string): LucideIcon {
  return ICON_MAP[name] ?? Bot;
}

/** List of available icon names for the icon picker */
export const AVAILABLE_ICONS = Object.keys(ICON_MAP);
