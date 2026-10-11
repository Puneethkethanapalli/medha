import type { ModelCapability } from '@/types';

export const LONG_CONTEXT_THRESHOLD = 100_000;

export type CapabilityMetadata = {
  contextWindow?: number;
  inputModalities?: readonly string[];
  outputModalities?: readonly string[];
  mode?: string;
  supportedParameters?: readonly string[];
  supportsFunctionCalling?: boolean;
  supportsToolChoice?: boolean;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
  supportsPdfInput?: boolean;
  maxPdfSizeMb?: number;
  outputCostPerImage?: number;
  inputCostPerImage?: number;
  outputCostPerImageToken?: number;
};

export const CAPABILITY_ORDER: readonly ModelCapability[] = [
  'vision',
  'image-gen',
  'pdf',
  'tools',
  'thinking',
  'long-context',
];

export function sortCapabilities(capabilities: Iterable<ModelCapability>): ModelCapability[] {
  const capabilitySet = new Set(capabilities);
  return CAPABILITY_ORDER.filter((capability) => capabilitySet.has(capability));
}

export function capabilitiesFromMetadata(metadata: CapabilityMetadata): ModelCapability[] {
  const capabilities = new Set<ModelCapability>();
  const inputModalities = normalizeList(metadata.inputModalities);
  const outputModalities = normalizeList(metadata.outputModalities);
  const supportedParameters = normalizeList(metadata.supportedParameters);
  const mode = metadata.mode?.toLowerCase() ?? '';

  if (metadata.supportsVision || inputModalities.has('image')) {
    capabilities.add('vision');
  }

  if (
    mode === 'image_generation' ||
    mode === 'image-generation' ||
    outputModalities.has('image') ||
    typeof metadata.outputCostPerImage === 'number' ||
    typeof metadata.inputCostPerImage === 'number' ||
    typeof metadata.outputCostPerImageToken === 'number'
  ) {
    capabilities.add('image-gen');
  }

  if (
    metadata.supportsPdfInput ||
    typeof metadata.maxPdfSizeMb === 'number' ||
    inputModalities.has('pdf') ||
    inputModalities.has('file') ||
    inputModalities.has('document')
  ) {
    capabilities.add('pdf');
  }

  if (
    metadata.supportsFunctionCalling ||
    metadata.supportsToolChoice ||
    supportedParameters.has('tools') ||
    supportedParameters.has('tool_choice') ||
    supportedParameters.has('function_call') ||
    supportedParameters.has('function_calling')
  ) {
    capabilities.add('tools');
  }

  if (
    metadata.supportsReasoning ||
    supportedParameters.has('reasoning') ||
    supportedParameters.has('include_reasoning') ||
    supportedParameters.has('reasoning_effort')
  ) {
    capabilities.add('thinking');
  }

  if (typeof metadata.contextWindow === 'number' && metadata.contextWindow > LONG_CONTEXT_THRESHOLD) {
    capabilities.add('long-context');
  }

  return sortCapabilities(capabilities);
}

function normalizeList(values?: readonly string[]): Set<string> {
  return new Set((values ?? []).map((value) => value.toLowerCase()));
}
