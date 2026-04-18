import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { View } from 'react-native';

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background gap-4 p-4">
      <Text className="text-foreground text-lg font-medium">Medha Sprint 0 Test</Text>
      <Button variant="default" onPress={() => console.log('Pressed!')}>
        <Text>Press Me</Text>
      </Button>
      <Button variant="secondary">
        <Text>Secondary</Text>
      </Button>
      <Button variant="outline">
        <Text>Outline</Text>
      </Button>
      <Button variant="ghost">
        <Text>Ghost</Text>
      </Button>
    </View>
  );
}
