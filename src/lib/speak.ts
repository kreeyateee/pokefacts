function chunks(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text];
  const groups: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + sentence).length > 240 && current) {
      groups.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) groups.push(current.trim());
  return groups;
}

function englishVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang === "en-GB") ??
    voices.find((voice) => voice.lang.startsWith("en"))
  );
}

export function stopSpeaking() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}

export function speakTexts(texts: string[], onEnd: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onEnd();
    return;
  }
  window.speechSynthesis.cancel();
  const pieces = texts.flatMap(chunks);
  if (pieces.length === 0) {
    onEnd();
    return;
  }
  const voice = englishVoice();
  let index = 0;
  const speakNext = () => {
    const piece = pieces[index];
    index += 1;
    if (!piece) {
      onEnd();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(piece);
    utterance.rate = 0.96;
    utterance.pitch = 0.92;
    if (voice) utterance.voice = voice;
    utterance.onend = speakNext;
    utterance.onerror = onEnd;
    window.speechSynthesis.speak(utterance);
  };
  speakNext();
}
