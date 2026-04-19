import { create } from 'zustand';

interface UIState {
  drawerOpen: boolean;
  modelPickerOpen: boolean;
  activeConversationId: string | null;
  toast: {
    id: number;
    message: string;
  } | null;
}

interface UIActions {
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  openModelPicker: () => void;
  closeModelPicker: () => void;
  setActiveConversation: (id: string | null) => void;
  showToast: (message: string) => void;
  hideToast: () => void;
}

export const useUIStore = create<UIState & UIActions>((set) => ({
  drawerOpen: false,
  modelPickerOpen: false,
  activeConversationId: null,
  toast: null,

  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
  openModelPicker: () => set({ modelPickerOpen: true }),
  closeModelPicker: () => set({ modelPickerOpen: false }),
  setActiveConversation: (id) => set({ activeConversationId: id }),
  showToast: (message) => set({ toast: { id: Date.now(), message } }),
  hideToast: () => set({ toast: null }),
}));
