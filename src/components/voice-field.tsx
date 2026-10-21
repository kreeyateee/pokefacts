import { isPiperVoice, PICKER_VOICES } from "@/lib/piper-voice";

export function VoiceField({
  id,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  value: string;
  onChange: (voiceId: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm" htmlFor={id}>
      Voice
      <select
        id={id}
        aria-label="Voice"
        className="pk-field"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {PICKER_VOICES.map((voice) => (
          <option key={voice.id} value={voice.id}>
            {voice.name} — {voice.note}
          </option>
        ))}
      </select>
      {isPiperVoice(value) ? (
        <p className="mt-1 text-xs leading-5 pk-quiet">
          Cori, British. Piper reads on this computer, so Hear works before you connect Yoto. Send still
          needs a Yoto login.
        </p>
      ) : (
        <p className="mt-1 text-xs leading-5 pk-quiet">This voice reads every track you send.</p>
      )}
    </label>
  );
}
