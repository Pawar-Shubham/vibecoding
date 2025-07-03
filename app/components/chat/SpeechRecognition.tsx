import { IconButton } from "~/components/ui/IconButton";
import { classNames } from "~/utils/classNames";
import React from "react";

export const SpeechRecognitionButton = ({
  isListening,
  onStart,
  onStop,
  disabled,
}: {
  isListening: boolean;
  onStart: () => void;
  onStop: () => void;
  disabled: boolean;
}) => {
  return (
    <IconButton
      title={isListening ? "Stop listening" : "Start speech recognition"}
      disabled={disabled}
      className={classNames(
        "transition-all p-2 sm:p-2.5 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center",
        {
          "text-bolt-elements-item-contentAccent": isListening,
        }
      )}
      onClick={isListening ? onStop : onStart}
    >
      {isListening ? (
        <div className="i-ph:microphone-slash text-lg sm:text-xl flex-shrink-0" />
      ) : (
        <div className="i-ph:microphone text-lg sm:text-xl flex-shrink-0" />
      )}
    </IconButton>
  );
};
