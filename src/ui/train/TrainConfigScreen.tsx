import { useEffect, useState } from 'react';
import { PROGRESSION_FLOOR_S, PROGRESSION_STEP_S, progressionParams } from '@domain/progression';
import {
  DEFAULT_TIMED_MS,
  PRESETS,
  validateParams,
  type AdvanceMode,
  type CountMode,
  type HandMode,
  type RunParams,
  type SetMode,
} from '@domain/runParams';
import { getProgressionInterval } from '@store/progressionStore';
import { getDifficultSetUnlocked } from '@store/scoringStore';
import { useTrainStore } from '@store/trainStore';

const COUNT_OPTIONS: CountMode[] = [13, 26, 52, 'unlimited'];

export function TrainConfigScreen() {
  const [params, setParams] = useState<RunParams>(PRESETS[1].params); // Quick drill as a sane default
  const [isPractice, setIsPractice] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [difficultUnlocked, setDifficultUnlocked] = useState(false);
  // §X — Progression mode: a preset whose per-triplet interval is derived from run history.
  const [progression, setProgression] = useState(false);
  const [progressionInterval, setProgressionInterval] = useState<number | null>(null);
  const startRun = useTrainStore((s) => s.startRun);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    getDifficultSetUnlocked().then(setDifficultUnlocked);
    getProgressionInterval().then(setProgressionInterval);
  }, []);

  const validation = validateParams(params, difficultUnlocked);

  function applyPreset(index: number) {
    const preset = PRESETS[index];
    setParams(preset.params);
    setIsPractice(preset.isPractice);
    setProgression(false);
  }

  function applyProgression() {
    if (progressionInterval === null) return;
    setParams(progressionParams(progressionInterval));
    setIsPractice(false);
    setProgression(true);
  }

  function patch(next: Partial<RunParams>) {
    setParams((p) => ({ ...p, ...next }));
    setIsPractice(false);
    setProgression(false);
  }

  async function handleStart() {
    if (!validation.valid) return;
    setStarting(true);
    await startRun(params, isPractice, { progression });
  }

  return (
    <div style={{ padding: '16px 12px 100px', maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-rank)', fontSize: 28, margin: '8px 0 16px' }}>Train</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        {PRESETS.map((preset, i) => (
          <button
            key={preset.name}
            onClick={() => applyPreset(i)}
            style={{
              ...presetButtonStyle,
              borderColor: !progression && samePresetSelected(params, isPractice, preset) ? 'var(--brass)' : 'rgba(239,231,214,0.16)',
            }}
          >
            {preset.name}
          </button>
        ))}
      </div>

      <button
        onClick={applyProgression}
        disabled={progressionInterval === null}
        style={{
          ...presetButtonStyle,
          width: '100%',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          textAlign: 'left',
          borderColor: progression ? 'var(--brass)' : 'rgba(239,231,214,0.16)',
        }}
      >
        <span>
          Progression
          <span style={{ display: 'block', fontSize: 11, color: 'var(--slate)', fontWeight: 400, marginTop: 2 }}>
            52 cards · timed · quizzed · −{PROGRESSION_STEP_S}s after each clean run (floor {PROGRESSION_FLOOR_S.toFixed(1)}s)
          </span>
        </span>
        <span className="mono" style={{ fontSize: 22, color: 'var(--brass)', fontWeight: 700, whiteSpace: 'nowrap' }}>
          {progressionInterval !== null ? `${progressionInterval.toFixed(1)}s` : '—'}
          <span style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 400 }}> /triplet</span>
        </span>
      </button>

      <button onClick={() => setShowGrid((v) => !v)} style={{ ...buttonStyle, marginBottom: 12 }}>
        {showGrid ? 'Hide' : 'Show'} custom parameters
      </button>

      {showGrid && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
          <AxisGroup<SetMode>
            label="Set"
            value={params.set}
            options={[
              { value: 'full', label: 'Full' },
              {
                value: 'difficult',
                label: 'Difficult',
                disabled: !difficultUnlocked,
                reason: !difficultUnlocked ? 'Unlocks once 60% of items have 3+ scored observations.' : undefined,
              },
            ]}
            onChange={(set) => patch({ set })}
          />
          <AxisGroup<HandMode>
            label="Hand"
            value={params.hand}
            options={[
              { value: 'single', label: 'Single' },
              { value: 'triplet', label: 'Triplet' },
            ]}
            onChange={(hand) => patch({ hand })}
          />
          <AxisGroup<AdvanceMode>
            label="Advance"
            value={params.advance}
            options={[
              { value: 'tap', label: 'Tap' },
              { value: 'timed', label: 'Timed' },
            ]}
            onChange={(advance) =>
              patch({ advance, timed_ms: advance === 'timed' ? params.timed_ms ?? DEFAULT_TIMED_MS : undefined })
            }
          />
          {params.advance === 'timed' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              Interval (ms)
              <input
                type="number"
                min={500}
                step={250}
                value={params.timed_ms ?? DEFAULT_TIMED_MS}
                onChange={(e) => patch({ timed_ms: Number(e.target.value) })}
                style={{ ...inputStyle, width: 100 }}
              />
            </label>
          )}
          <AxisGroup<CountMode>
            label="Count"
            value={params.count}
            options={COUNT_OPTIONS.map((c) => ({ value: c, label: String(c) }))}
            onChange={(count) => patch({ count })}
          />
          <AxisGroup<'false' | 'true'>
            label="Quizzed"
            value={params.quizzed ? 'true' : 'false'}
            options={[
              { value: 'false', label: 'No' },
              { value: 'true', label: 'Yes' },
            ]}
            onChange={(v) => patch({ quizzed: v === 'true' })}
          />
        </div>
      )}

      {!validation.valid && (
        <p style={{ color: 'var(--carmine)', fontSize: 13, marginBottom: 12 }}>{validation.reason}</p>
      )}

      <button
        onClick={handleStart}
        disabled={!validation.valid || starting}
        style={{
          ...buttonStyle,
          background: 'var(--brass)',
          color: 'var(--ink)',
          fontWeight: 600,
          width: '100%',
          padding: '14px 0',
          opacity: validation.valid ? 1 : 0.5,
        }}
      >
        Start run
      </button>
    </div>
  );
}

function samePresetSelected(
  params: RunParams,
  isPractice: boolean,
  preset: (typeof PRESETS)[number],
): boolean {
  return JSON.stringify(params) === JSON.stringify(preset.params) && isPractice === preset.isPractice;
}

function AxisGroup<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean; reason?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            disabled={opt.disabled}
            title={opt.disabled ? opt.reason : undefined}
            onClick={() => onChange(opt.value)}
            style={{
              ...chipStyle,
              borderColor: value === opt.value ? 'var(--brass)' : 'rgba(239,231,214,0.16)',
              color: value === opt.value ? 'var(--brass)' : 'var(--stock)',
              opacity: opt.disabled ? 0.4 : 1,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const presetButtonStyle: React.CSSProperties = {
  padding: '14px 10px',
  background: 'var(--felt-raised)',
  border: '1px solid',
  borderRadius: 10,
  color: 'var(--stock)',
  fontSize: 14,
  fontWeight: 500,
};

const buttonStyle: React.CSSProperties = {
  background: 'var(--felt-raised)',
  border: '1px solid rgba(239,231,214,0.16)',
  borderRadius: 8,
  color: 'var(--stock)',
  padding: '10px 14px',
  fontSize: 14,
};

const chipStyle: React.CSSProperties = {
  background: 'var(--felt-raised)',
  border: '1px solid',
  borderRadius: 20,
  padding: '6px 14px',
  fontSize: 13,
};

const inputStyle: React.CSSProperties = {
  background: 'var(--felt-raised)',
  border: '1px solid rgba(239,231,214,0.16)',
  borderRadius: 6,
  color: 'var(--stock)',
  padding: '6px 10px',
};
