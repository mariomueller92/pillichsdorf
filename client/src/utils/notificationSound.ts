import { Howl } from 'howler';
import { useUIStore } from '@/stores/uiStore';

const notificationSound = new Howl({
  src: ['/sounds/notification.mp3'],
  volume: 0.8,
});

export function playNotificationSound(): void {
  if (useUIStore.getState().soundEnabled) {
    notificationSound.play();
  }
}
