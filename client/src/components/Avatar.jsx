import { useEffect, useRef, useState } from "react";
import { useBuddy } from "../context/BuddyState";
import { AVATAR_PRESETS } from "../assets/avatars/index.js";
import useEntryAnimation from "../hooks/useEntryAnimation";
import useAudioPlayer from "../hooks/useAudioPlayer";

export default function Avatar() {
  const { state } = useBuddy();
  const { avatar, subtitle, input, agent } = state;
  useAudioPlayer();
  const [showTalkFrame, setShowTalkFrame] = useState(false);
  const mouthIntervalRef = useRef(null);
  const bobRef = useRef(null);
  const bobYRef = useRef(0);
  const bobFrameRef = useRef(null);
  const [thinkingDots, setThinkingDots] = useState(".");
  const thinkingRef = useRef(null);
  const { ref: entryRef, entered } = useEntryAnimation(0);

  // Bob animation via requestAnimationFrame
  useEffect(() => {
    let startTime = null;
    function animate(timestamp) {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const y = Math.sin((elapsed / 3000) * Math.PI * 2) * -4;
      bobYRef.current = y;
      if (bobRef.current) {
        bobRef.current.style.transform = `translateY(${y}px)`;
      }
      bobFrameRef.current = requestAnimationFrame(animate);
    }
    bobFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (bobFrameRef.current) cancelAnimationFrame(bobFrameRef.current);
    };
  }, []);

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

  // Thinking dots animation via setInterval
  useEffect(() => {
    if (input.isProcessing && !subtitle.visible) {
      thinkingRef.current = setInterval(() => {
        setThinkingDots((prev) => {
          if (prev === ".") return "..";
          if (prev === "..") return "...";
          return ".";
        });
      }, 500);
    } else {
      clearInterval(thinkingRef.current);
      setThinkingDots(".");
    }
    return () => clearInterval(thinkingRef.current);
  }, [input.isProcessing, subtitle.visible]);

  const preset = AVATAR_PRESETS[agent.avatar] || AVATAR_PRESETS.buddy;
  const avatarSrc = showTalkFrame ? preset.talking : preset.idle;

  return (
    <div
      ref={entryRef}
      data-entered={entered}
      className="enter-fade-up absolute bottom-4 left-4 z-50 flex items-end gap-3"
    >
      {/* Avatar image with JS bob animation */}
      <div ref={bobRef} className="flex-shrink-0 flex flex-col items-center">
        <img
          src={avatarSrc}
          alt={agent.name}
          style={{ width: "144px", height: "144px" }}
          draggable={false}
        />
      </div>

      {/* Subtitle or thinking indicator */}
      {subtitle.visible && subtitle.text ? (
        <div
          className="enter-fade-left rounded-2xl px-4 py-2 max-w-md text-sm"
          data-entered={entered}
          style={{
            backgroundColor: "var(--color-bg-surface)",
            boxShadow: "var(--shadow-elevated)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-primary)",
          }}
        >
          {subtitle.text}
        </div>
      ) : input.isProcessing ? (
        <div
          className="rounded-2xl px-4 py-2 max-w-md text-sm font-medium"
          style={{
            backgroundColor: "var(--color-bg-surface)",
            boxShadow: "var(--shadow-elevated)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-muted)",
          }}
        >
          {thinkingDots}
        </div>
      ) : null}
    </div>
  );
}
