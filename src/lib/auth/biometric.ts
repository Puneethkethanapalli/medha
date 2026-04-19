import * as LocalAuthentication from 'expo-local-authentication';

export type BiometricLevel = 'none' | 'some' | 'strong';

export interface BiometricStatus {
  hasHardware: boolean;
  isEnrolled: boolean;
  level: BiometricLevel;
  supportsDeviceCredential: boolean;
}

export async function getBiometricStatus(): Promise<BiometricStatus> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();

  if (!hasHardware || !isEnrolled) {
    return {
      hasHardware,
      isEnrolled,
      level: 'none',
      supportsDeviceCredential: false,
    };
  }

  const supportedLevel = await LocalAuthentication.getEnrolledLevelAsync();

  let level: BiometricLevel;
  switch (supportedLevel) {
    case LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG:
      level = 'strong';
      break;
    case LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK:
    case LocalAuthentication.SecurityLevel.BIOMETRIC:
      level = 'some';
      break;
    default:
      level = 'none';
  }

  return {
    hasHardware,
    isEnrolled,
    level,
    supportsDeviceCredential: true,
  };
}

export async function authenticateWithBiometric(
  promptMessage: string = 'Authenticate to access Medha'
): Promise<{ success: boolean; error?: string }> {
  const status = await getBiometricStatus();

  if (!status.hasHardware) {
    return { success: false, error: 'No biometric hardware available' };
  }

  if (!status.isEnrolled) {
    return { success: false, error: 'No biometrics enrolled' };
  }

  if (status.level !== 'strong') {
    return {
      success: false,
      error: 'Insufficient biometric security. Please set up Strong biometrics (PIN, Pattern, or Password) in your device settings.',
    };
  }

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: 'Use Device Passcode',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
      biometricsSecurityLevel: 'strong',
    });

    if (result.success) {
      return { success: true };
    }

    switch (result.error) {
      case 'user_cancel':
        return { success: false, error: 'Authentication cancelled' };
      case 'user_fallback':
        return { success: false, error: 'Please use device passcode' };
      case 'system_cancel':
        return { success: false, error: 'System cancelled authentication' };
      case 'lockout':
        return { success: false, error: 'Too many attempts. Please try again later.' };
      default:
        return { success: false, error: 'Authentication failed' };
    }
  } catch (e: any) {
    return { success: false, error: e.message || 'Authentication failed' };
  }
}

export async function canUseBiometricLock(): Promise<boolean> {
  const status = await getBiometricStatus();
  return status.hasHardware && status.isEnrolled && status.level === 'strong';
}
