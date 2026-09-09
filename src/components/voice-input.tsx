"use client";

import { useRef, useState, useCallback } from "react";

function getRecognitionConstructor(): (new () => any) | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
}

export function useVoiceInput(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported] = useState(() => !!getRecognitionConstructor());
  const recognitionRef = useRef<any>(null);

  const toggle = useCallback(() => {
    const Ctor = getRecognitionConstructor();
    if (!Ctor) return;

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const rec = new Ctor();
    recognitionRef.current = rec;
    rec.lang = "ru-RU";
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event: any) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      onResult(transcript);
    };

    rec.onerror = () => { setListening(false); };
    rec.onend = () => { setListening(false); };

    setListening(true);
    rec.start();
  }, [listening, onResult]);

  return { listening, supported, toggle };
}