/**
 * Image generation tool — Sprint 16
 *
 * Generates images using DALL-E 3 (OpenAI) or Stability AI.
 * The AI decides when to generate via tool calling.
 */

import { fetch } from 'expo/fetch';
import { File, Directory, Paths } from 'expo-file-system';
import { v4 as uuidv4 } from 'uuid';
import type { ToolDefinition, ToolResult } from './types';
import { getApiKey } from '@/lib/storage/secure';
import { getImageGenService } from '@/lib/storage/mmkv';

const OPENAI_IMAGE_ENDPOINT = 'https://api.openai.com/v1/images/generations';
const STABILITY_IMAGE_ENDPOINT = 'https://api.stability.ai/v2beta/stable-image/generate/sd3';

async function executeGenerateImage(args: Record<string, unknown>): Promise<ToolResult> {
  const prompt = String(args.prompt || '').trim();
  if (!prompt) {
    return { content: 'No image prompt provided.' };
  }

  const size = String(args.size || '1024x1024');
  const service = await getImageGenService();

  const apiKey = await getApiKey('image-gen');
  if (!apiKey) {
    return {
      content: 'Image generation is not available. Please add an image generation API key in Settings → API Keys.',
    };
  }

  try {
    let imageUri: string;

    if (service === 'stability') {
      imageUri = await generateStability(prompt, apiKey);
    } else {
      // Default to OpenAI DALL-E 3
      imageUri = await generateOpenAI(prompt, size, apiKey);
    }

    return {
      content: `![Generated image](${imageUri})`,
      raw: imageUri,
      display: {
        kind: 'image',
        title: 'Image generated',
        status: 'success',
        summary: prompt,
        imageUri,
        metadata: [
          { label: 'Service', value: service === 'stability' ? 'Stability AI' : 'OpenAI' },
          { label: 'Size', value: size },
        ],
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { content: `Image generation failed: ${msg}` };
  }
}

async function generateOpenAI(prompt: string, size: string, apiKey: string): Promise<string> {
  const response = await fetch(OPENAI_IMAGE_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      size,
      n: 1,
      response_format: 'b64_json',
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new Error(`OpenAI API error: ${text}`);
  }

  const data = await response.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image data returned from OpenAI');

  return await saveBase64Image(b64);
}

async function generateStability(prompt: string, apiKey: string): Promise<string> {
  const formData = new FormData();
  formData.append('prompt', prompt);
  formData.append('output_format', 'png');

  const response = await fetch(STABILITY_IMAGE_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'image/*',
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new Error(`Stability AI error: ${text}`);
  }

  // Read binary response and convert to base64
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 = btoa(binary);

  return await saveBase64Image(b64);
}

async function saveBase64Image(base64Data: string): Promise<string> {
  const dir = new Directory(Paths.document, 'generated-images');
  if (!dir.exists) {
    dir.create();
  }

  const fileName = `${uuidv4()}.png`;
  const destFile = new File(dir, fileName);

  destFile.write(base64Data, { encoding: 'base64' });

  return destFile.uri;
}

/**
 * The generate_image tool definition.
 * Register via `registerTool(generateImageTool)`.
 */
export const generateImageTool: ToolDefinition = {
  name: 'generate_image',
  description:
    'Generate an image based on a text description. Use when the user asks to create, draw, design, or visualize something.',
  parameters: {
    prompt: {
      type: 'string',
      description: 'Detailed image description',
      required: true,
    },
    size: {
      type: 'string',
      description: 'Image size',
      enum: ['1024x1024', '1024x1792', '1792x1024'],
      required: false,
    },
  },
  execute: executeGenerateImage,
};
