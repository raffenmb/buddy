import { COMMAND_MAP } from "@buddy/shared";

export function routeCommand(command, params, dispatch) {
  const type = COMMAND_MAP[command];
  if (type) {
    dispatch({ type, payload: params });
  }
}
