import { create } from 'zustand';
import type { Message } from '@/types';

interface UIState {
  drawerOpen: boolean;
  modelPickerOpen: boolean;
  themePickerOpen: boolean;
  activeConversationId: string | null;
  toast: {
    id: number;
    message: string;
  } | null;
  // Message actions menu
  actionsMenuMessage: Message | null;
  // Edit mode
  editingMessageId: string | null;
}

interface UIActions {
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  openModelPicker: () => void;
  closeModelPicker: () => void;
  openThemePicker: () => void;
  closeThemePicker: () => void;
  setActiveConversation: (id: string | null) => void;
  showToast: (message: string) => void;
  hideToast: () => void;
  showActionsMenu: (message: Message) => void;
  hideActionsMenu: () => void;
  setEditingMessage: (id: string | null) => void;
}

export const useUIStore = create<UIState & UIActions>((set) => ({
  drawerOpen: false,
  modelPickerOpen: false,
  themePickerOpen: false,
  activeConversationId: null,
  toast: null,
  actionsMenuMessage: null,
  editingMessageId: null,

  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
  openModelPicker: () => set({ modelPickerOpen: true }),
  closeModelPicker: () => set({ modelPickerOpen: false }),
  openThemePicker: () => set({ themePickerOpen: true }),
  closeThemePicker: () => set({ themePickerOpen: false }),
  setActiveConversation: (id) => set({ activeConversationId: id }),
  showToast: (message) => set({ toast: { id: Date.now(), message } }),
  hideToast: () => set({ toast: null }),
  showActionsMenu: (message) => set({ actionsMenuMessage: message }),
  hideActionsMenu: () => set({ actionsMenuMessage: null }),
  setEditingMessage: (id) => set({ editingMessageId: id }),
}));
