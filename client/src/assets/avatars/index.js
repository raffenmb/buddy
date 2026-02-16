import buddyIdle from "./buddy-idle.svg";
import buddyTalking from "./buddy-talking.svg";
import robotIdle from "./robot-idle.svg";
import robotTalking from "./robot-talking.svg";
import owlIdle from "./owl-idle.svg";
import owlTalking from "./owl-talking.svg";

export const AVATAR_PRESETS = {
  buddy: { idle: buddyIdle, talking: buddyTalking, label: "Buddy" },
  robot: { idle: robotIdle, talking: robotTalking, label: "Robot" },
  owl:   { idle: owlIdle,   talking: owlTalking,   label: "Owl" },
};
