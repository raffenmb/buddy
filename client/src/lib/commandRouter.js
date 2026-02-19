const actionMap = {
  "canvas_set_mode": "CANVAS_SET_MODE",
  "canvas_add_card": "CANVAS_ADD_CARD",
  "canvas_update_card": "CANVAS_UPDATE_CARD",
  "canvas_remove_element": "CANVAS_REMOVE_ELEMENT",
  "canvas_show_text": "CANVAS_SHOW_TEXT",
  "canvas_show_chart": "CANVAS_SHOW_CHART",
  "canvas_show_table": "CANVAS_SHOW_TABLE",
  "canvas_play_media": "CANVAS_PLAY_MEDIA",
  "canvas_show_notification": "CANVAS_SHOW_NOTIFICATION",
  "canvas_set_theme": "CANVAS_SET_THEME",
  "canvas_show_confirmation": "CANVAS_SHOW_CONFIRMATION"
};

export function routeCommand(command, params, dispatch) {
  const type = actionMap[command];
  if (type) {
    dispatch({ type, payload: params });
  }
}
