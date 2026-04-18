# Build Instructions

This document covers building the Medha Expo app as a standalone APK for local testing.

## Expo Commands Overview

| Command | Use Case |
|---------|----------|
| `npx expo start` | **Development** - hot reload, fast iteration, works with Metro bundler |
| `npx expo export` | **Production bundle** - creates bundled JS (`*.hbc` for Android, `*.js` for iOS) without native build |
| `npx expo run:android` | **Full native build** - builds APK/AAB and deploys to device/emulator |

### When to use each command:

- **`npx expo start`**: During active development. The app loads JS dynamically from Metro bundler, so changes reflect immediately.

- **`npx expo export`**: Test that your JS code bundles correctly for production. Creates static files in `dist/` folder. Faster than full native build - useful in CI/CD pipelines.

- **`npx expo run:android`**: When you need a working APK installed on a device. Does `export` first, then builds the native Android app.

### Example workflow:
```bash
# 1. Start development (Terminal 1)
npx expo start

# 2. In another terminal, run the app on emulator/device
npx expo run:android

# 3. When ready to test production bundle (no Metro needed)
npx expo export --platform android

# 4. Build release APK (standalone, no Metro required)
cd android && ./gradlew assembleRelease
```

## Prerequisites

- Node.js 18+ and pnpm
- Android SDK (configured via `ANDROID_HOME` or `ANDROID_SDK_ROOT`)
- Java Development Kit (JDK) 17+

### Java Setup

**Install JDK 17:**
```bash
# Arch Linux
sudo pacman -S jdk17-openjdk

# Ubuntu/Debian
sudo apt install openjdk-17-jdk

# macOS (Homebrew)
brew install openjdk@17
```

**Add to PATH (Bash):**
```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
export PATH=$JAVA_HOME/bin:$PATH
# Add to ~/.bashrc for permanence
```

**Add to PATH (Fish):**
```bash
# Add to ~/.config/fish/config.fish
set -gx JAVA_HOME /usr/lib/jvm/java-17-openjdk
fish_add_path $JAVA_HOME/bin
# Reload: source ~/.config/fish/config.fish
```

**Verify:**
```bash
java -version
```

Check Android SDK setup:
```bash
echo $ANDROID_HOME   # should point to Android SDK
ls $ANDROID_HOME/platforms   # should list installed platforms
```

## Method 1: Using Expo CLI (Recommended)

### Step 1: Install Dependencies
```bash
pnpm install
```

### Step 2: Generate Android Directory (if not present)
```bash
npx expo prebuild --platform android
```

### Step 3: Build Debug APK
```bash
npx expo run:android
```

This builds and launches the app on a connected device/emulator. The APK is also output to `android/app/build/outputs/apk/debug/`.

## Method 2: Using Gradle Directly

### Step 1: Navigate to Android Directory
```bash
cd android
```

### Step 2: Clean and Build
```bash
./gradlew assembleDebug
```

### Step 3: APK Location
The debug APK will be at:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

## Method 3: Release APK (for testing production build)

### Step 1: Create JS Bundle
```bash
npx expo export --platform android
```

### Step 2: Build Release APK
```bash
cd android
./gradlew assembleRelease
```

Release APK: `android/app/build/outputs/apk/release/app-release.apk`

## Testing the APK

### Install on Device/Emulator
```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### View Logs
```bash
adb logcat | grep -i "medha\|react\|expo"
```

## Important: Debug APK vs Standalone APK

**Debug APK** (`./gradlew assembleDebug`) requires Metro dev server running. It will **stuck on splash screen** if installed without Metro.

**Standalone APK** (no Metro required):
```bash
# Option 1: Release build (recommended for testing)
cd android
./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk

# Option 2: Preview build via EAS
eas build --platform android --profile preview --local
```

### Common Issues

**`ANDROID_HOME` not set (Bash):**
```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools
```

**`ANDROID_HOME` not set (Fish):**
```bash
set -gx ANDROID_HOME /home/puneeth/Android/Sdk
```

**Prebuild errors:** Run `npx expo prebuild --platform android --clean` to regenerate the android folder.

**Gradle build failures:** Try `./gradlew clean` before rebuilding.
