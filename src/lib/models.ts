import type { Model } from '@/types';

export function getModelDisplayName(modelId: string | null): string {
  if (!modelId) return 'Select Model';

  const parts = modelId.split('/');
  let name = parts.length > 1 ? parts[1] : parts[0];
  name = name.replace(/:free$/, '');

  return name
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function keepSelectedModelVisible(
  models: Model[],
  selectedModelId: string | null,
  providerId: string | null,
  selectedModelName?: string | null
): Model[] {
  if (!selectedModelId || !providerId) return models;

  const selectedModelExists = models.some(
    (model) => model.id === selectedModelId && model.provider === providerId
  );

  if (selectedModelExists) return models;

  return [
    {
      id: selectedModelId,
      name: selectedModelName || getModelDisplayName(selectedModelId),
      provider: providerId,
    },
    ...models,
  ];
}
