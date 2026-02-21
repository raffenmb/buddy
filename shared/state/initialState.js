export const initialState = {
  avatar: { isTalking: false },
  subtitle: { text: '', visible: false },
  canvas: {
    mode: 'ambient',
    layout: 'single',
    theme: { mode: 'dark', accent_color: '#3B82F6' },
    elements: [],
    notification: null,
  },
  input: { isProcessing: false },
  connected: false,
  agent: { name: 'Buddy', id: 'buddy', avatar: 'buddy' },
  view: 'buddy',
  adminScreen: 'list',
  adminSelectedAgentId: null,
};
