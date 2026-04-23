import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { v4 as uuidv4 } from 'uuid';
import { persistAttachment } from './storage';
import type { Attachment } from '@/types';

// Max file size: 20MB
const MAX_FILE_SIZE = 20 * 1024 * 1024;

/**
 * Pick images from gallery.
 * Returns array of Attachment objects (already persisted to app storage).
 */
export async function pickImages(): Promise<Attachment[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    quality: 0.8,
    selectionLimit: 5,
  });

  if (result.canceled || !result.assets.length) return [];

  const attachments: Attachment[] = [];

  for (const asset of result.assets) {
    const fileName = asset.fileName || `image_${Date.now()}.jpg`;
    const fileSize = asset.fileSize || 0;

    if (fileSize > MAX_FILE_SIZE) continue; // skip oversized

    const persistedUri = persistAttachment(asset.uri, fileName);

    attachments.push({
      id: uuidv4(),
      type: 'image',
      uri: persistedUri,
      name: fileName,
      mimeType: asset.mimeType || 'image/jpeg',
      size: fileSize,
    });
  }

  return attachments;
}

/**
 * Take a photo with camera.
 */
export async function takePhoto(): Promise<Attachment | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    quality: 0.8,
  });

  if (result.canceled || !result.assets.length) return null;

  const asset = result.assets[0];
  const fileName = asset.fileName || `photo_${Date.now()}.jpg`;
  const persistedUri = persistAttachment(asset.uri, fileName);

  return {
    id: uuidv4(),
    type: 'image',
    uri: persistedUri,
    name: fileName,
    mimeType: asset.mimeType || 'image/jpeg',
    size: asset.fileSize || 0,
  };
}

/**
 * Pick documents (PDF, TXT, etc.)
 */
export async function pickDocuments(): Promise<Attachment[]> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
    type: [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/json',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  });

  if (result.canceled || !result.assets.length) return [];

  const attachments: Attachment[] = [];

  for (const asset of result.assets) {
    if (asset.size && asset.size > MAX_FILE_SIZE) continue;

    const persistedUri = persistAttachment(asset.uri, asset.name);

    attachments.push({
      id: uuidv4(),
      type: 'document',
      uri: persistedUri,
      name: asset.name,
      mimeType: asset.mimeType || 'application/octet-stream',
      size: asset.size || 0,
    });
  }

  return attachments;
}
