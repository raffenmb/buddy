export const WS_MESSAGE_TYPES = {
  // Server -> Client
  SUBTITLE: 'subtitle',
  CANVAS_COMMAND: 'canvas_command',
  PROCESSING: 'processing',
  AGENT_SWITCH: 'agent_switch',
  CANVAS_REHYDRATE: 'canvas_rehydrate',
  TTS_START: 'tts_start',
  TTS_END: 'tts_end',
  TTS_FALLBACK: 'tts_fallback',
  // Client -> Server
  CONFIRM_RESPONSE: 'confirm_response',
  FORM_RESPONSE: 'form_response',
  CANVAS_ELEMENT_UPDATE: 'canvas_element_update',
  FILE_UPLOAD: 'file_upload',
};
