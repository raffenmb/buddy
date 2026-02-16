import { useEffect, useRef, useState } from "react";
import { useBuddy } from "../context/BuddyState";
import buddyIdle from "../assets/buddy-idle.svg";
import buddyTalking from "../assets/buddy-talking.svg";

export default function Avatar() {
  const { state, dispatch } = useBuddy();
  const { avatar, subtitle, input } = state;
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

  // Talk duration timer — stop talking after calculated duration
  useEffect(() => {
    if (subtitle.visible && subtitle.text) {
      const duration = Math.min(
        Math.max((subtitle.text.length / 15) * 1000, 1000),
        10000
      );

      talkTimerRef.current = setTimeout(() => {
        dispatch({ type: "STOP_TALKING" });
      }, duration);
    }

    return () => {
      clearTimeout(talkTimerRef.current);
    };
  }, [subtitle.visible, subtitle.text, dispatch]);

  const avatarSrc = showTalkFrame ? buddyTalking : buddyIdle;

  return (
    <div
      className="fixed z-50 flex items-end gap-3"
      style={{ bottom: "80px", left: "16px" }}
    >
      {/* Avatar image with idle bob animation */}
      <div className="avatar-bob flex-shrink-0">
        <img
          src={avatarSrc}
          alt="Buddy"
          style={{ width: "120px", height: "120px" }}
          draggable={false}
        />
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
