import { create } from 'zustand';
import type { Attachment, Message } from '@/types';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

interface UIState {
  drawerOpen: boolean;
  modelPickerOpen: boolean;
  chatSettingsOpen: boolean;
  themePickerOpen: boolean;
  attachmentSheetOpen: boolean;
  onAttachCallback: ((attachments: Attachment[]) => void) | null;
  activeConversationId: string | null;
  toast: {
    id: number;
    message: string;
    action?: ToastAction;
  } | null;
  // Message actions menu
  actionsMenuMessage: Message | null;
  // Edit mode
  editingMessageId: string | null;
  // Pending per-conversation rule (before conversation is created)
  pendingConversationRule: string | null;
  // Skill picker bottom sheet
  skillPickerOpen: boolean;
}

interface UIActions {
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  openModelPicker: () => void;
  closeModelPicker: () => void;
  openChatSettings: () => void;
  closeChatSettings: () => void;
  openAttachmentSheet: (onAttach: (attachments: Attachment[]) => void) => void;
  closeAttachmentSheet: () => void;
  openThemePicker: () => void;
  closeThemePicker: () => void;
  setActiveConversation: (id: string | null) => void;
  showToast: (message: string, action?: ToastAction) => void;
  hideToast: () => void;
  showActionsMenu: (message: Message) => void;
  hideActionsMenu: () => void;
  setEditingMessage: (id: string | null) => void;
  setPendingConversationRule: (rule: string | null) => void;
  openSkillPicker: () => void;
  closeSkillPicker: () => void;
}

export const useUIStore = create<UIState & UIActions>((set) => ({
  drawerOpen: false,
  modelPickerOpen: false,
  chatSettingsOpen: false,
  themePickerOpen: false,
  attachmentSheetOpen: false,
  onAttachCallback: null,
  activeConversationId: null,
  toast: null,
  actionsMenuMessage: null,
  editingMessageId: null,
  pendingConversationRule: null,
  skillPickerOpen: false,

  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
  openModelPicker: () => set({ modelPickerOpen: true }),
  closeModelPicker: () => set({ modelPickerOpen: false }),
  openChatSettings: () => set({ chatSettingsOpen: true }),
  closeChatSettings: () => set({ chatSettingsOpen: false }),
  openAttachmentSheet: (onAttach) => set({ attachmentSheetOpen: true, onAttachCallback: onAttach }),
  closeAttachmentSheet: () => set({ attachmentSheetOpen: false, onAttachCallback: null }),
  openThemePicker: () => set({ themePickerOpen: true }),
  closeThemePicker: () => set({ themePickerOpen: false }),
  setActiveConversation: (id) => set({ activeConversationId: id }),
  showToast: (message, action) => set({ toast: { id: Date.now(), message, action } }),
  hideToast: () => set({ toast: null }),
  showActionsMenu: (message) => set({ actionsMenuMessage: message }),
  hideActionsMenu: () => set({ actionsMenuMessage: null }),
  setEditingMessage: (id) => set({ editingMessageId: id }),
  setPendingConversationRule: (rule) => set({ pendingConversationRule: rule }),
  openSkillPicker: () => set({ skillPickerOpen: true }),
  closeSkillPicker: () => set({ skillPickerOpen: false }),
}));
