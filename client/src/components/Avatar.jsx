import { useEffect, useRef, useState } from "react";
import { useBuddy } from "../context/BuddyState";
import { AVATAR_PRESETS } from "../assets/avatars/index.js";

export default function Avatar() {
  const { state, dispatch } = useBuddy();
  const { avatar, subtitle, input, agent } = state;
  const [showTalkFrame, setShowTalkFrame] = useState(false);
  const talkTimerRef = useRef(null);
  const mouthIntervalRef = useRef(null);

  // Mouth toggle animation while talking
  useEffect(() => {
    if (avatar.isTalking) {
      mouthIntervalRef.current = setInterval(() => {
        setShowTalkFrame((prev) => !prev);
      }, 150);
    } else {
      clearInterval(mouthIntervalRef.current);
      setShowTalkFrame(false);
    }

    return () => {
      clearInterval(mouthIntervalRef.current);
    };
  }, [avatar.isTalking]);

  // TTS + talk duration — speak subtitle and sync mouth animation
  useEffect(() => {
    if (subtitle.visible && subtitle.text) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(subtitle.text);
      utterance.rate = 1;
      utterance.pitch = 1;

      utterance.onend = () => {
        dispatch({ type: "STOP_TALKING" });
      };

      utterance.onerror = () => {
        dispatch({ type: "STOP_TALKING" });
      };

      window.speechSynthesis.speak(utterance);

      // Fallback timer in case onend doesn't fire
      const fallbackDuration = Math.min(
        Math.max((subtitle.text.length / 15) * 1000, 1000),
        15000
      );
      talkTimerRef.current = setTimeout(() => {
        dispatch({ type: "STOP_TALKING" });
      }, fallbackDuration);
    }

    return () => {
      clearTimeout(talkTimerRef.current);
      window.speechSynthesis.cancel();
    };
  }, [subtitle.visible, subtitle.text, dispatch]);

  // Look up avatar preset from agent state, fallback to buddy
  const preset = AVATAR_PRESETS[agent.avatar] || AVATAR_PRESETS.buddy;
  const avatarSrc = showTalkFrame ? preset.talking : preset.idle;

  return (
    <div
      className="fixed z-50 flex items-end gap-3"
      style={{ bottom: "80px", left: "16px" }}
    >
      {/* Avatar image with idle bob animation */}
      <div className="avatar-bob flex-shrink-0 flex flex-col items-center">
        <img
          src={avatarSrc}
          alt={agent.name}
          style={{ width: "120px", height: "120px" }}
          draggable={false}
        />
        <span className="text-white/70 text-xs mt-1">{agent.name}</span>
      </div>

      {/* Subtitle or thinking indicator */}
      {subtitle.visible && subtitle.text ? (
        <div className="subtitle-enter bg-black/70 backdrop-blur rounded-lg px-4 py-2 text-white max-w-md">
          {subtitle.text}
        </div>
      ) : input.isProcessing ? (
        <div className="bg-black/70 backdrop-blur rounded-lg px-4 py-2 text-white max-w-md">
          <span className="thinking-dots">...</span>
        </div>
      ) : null}

      {/* Inline styles for animations */}
      <style>{`
        .avatar-bob {
          animation: float 3s ease-in-out infinite;
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-4px);
          }
        }

        .thinking-dots {
          display: inline-block;
          animation: pulse 1.5s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
