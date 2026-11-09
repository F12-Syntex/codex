"use client";

/**
 * Settings → Intelligence (owner: WS-A). Mounted by `settings-page.tsx` (`activeTab === "ai"`), with
 * `<AICacheGroup />` in Storage. The OpenRouter group carries the app's one AI health banner
 * (no key / key rejected / rate limited / offline), fed by `ai:health` + `health` events.
 *
 * Renders a fragment of `ListGroup`s so it drops into the pane column (`flex flex-col gap-7`).
 * Everything goes through `useAISettings` (main is the source of truth; the key is write-only).
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, ChevronDown, Loader2, RefreshCw, RotateCcw, Trash2, X } from "lucide-react";
import type { AIHealthState, ModelRole, PublicAISettings, TaskId } from "@shared/ai/types";
import { MODEL_ROLES } from "@shared/ai/types";
import { DEFAULT_MODELS, MODEL_ROLE_INFO, TASK_LABELS } from "@shared/ai/models";
import { cn } from "@/lib/utils";
import { useAICacheStats, useAIModels, useAISettings, useAIUsage } from "@/lib/ai/useAISettings";
import { ListGroup, ListRow } from "@/components/ui/list-group";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SecureInput } from "@/components/ui/secure-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { NumberStepper } from "@/components/ui/number-stepper";
import { ModelCombobox } from "@/components/ui/model-combobox";

/* ── Formatting helpers ──────────────────────────────────── */

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatUsd(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** "42 s", "3 min" — time left until a rate-limit pause lifts. */
function formatCountdown(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000));
  return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`;
}

/** Wall clock that ticks every second while `active`; `null` otherwise. */
function useNow(active: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      setNow(null);
    };
  }, [active]);
  return active ? now : null;
}

const HEALTH_COPY: Record<Exclude<AIHealthState, "ok">, { title: string; body: string }> = {
  no_key: { title: "No API key", body: "Add an OpenRouter key to turn on AI features." },
  auth_failed: { title: "Your key was rejected", body: "AI requests are paused until you enter a working key." },
  rate_limited: { title: "Rate limited", body: "OpenRouter asked Codex to slow down. Requests resume automatically." },
  offline: { title: "Can't reach OpenRouter", body: "Check your connection. Requests retry automatically." },
};

/* ── Intelligence pane ───────────────────────────────────── */

export function IntelligencePane() {
  const ai = useAISettings();
  const s = ai.settings;

  if (!s) {
    return (
      <ListGroup title="OpenRouter">
        <ListRow
          label={ai.loading ? "Loading AI settings…" : "AI settings unavailable"}
          description={ai.error ?? undefined}
        >
          {ai.loading && <Loader2 className="size-4 animate-spin text-label-tertiary" />}
        </ListRow>
      </ListGroup>
    );
  }

  return (
    <>
      <KeyGroup settings={s} health={ai.health} retryAt={ai.retryAt} healthMessage={ai.healthMessage} setKey={ai.setKey} testKey={ai.testKey} />
      <ModelsGroup settings={s} update={ai.update} />
      <LimitsGroup settings={s} update={ai.update} />
      <ReadingGroup settings={s} update={ai.update} />
      <UsageGroup />
    </>
  );
}

type Update = ReturnType<typeof useAISettings>["update"];

/* ── Key + health ────────────────────────────────────────── */

function KeyGroup({
  settings,
  health,
  retryAt,
  healthMessage,
  setKey,
  testKey,
}: {
  settings: PublicAISettings;
  health: AIHealthState;
  retryAt?: number;
  healthMessage?: string;
  setKey: (key: string) => Promise<boolean>;
  testKey: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [draft, setDraft] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const save = async () => {
    setSaving(true);
    setTestResult(null);
    const ok = await setKey(draft.trim());
    setSaving(false);
    if (ok) {
      setDraft("");
      setRevealed(false);
    }
  };

  const remove = async () => {
    setTestResult(null);
    await setKey("");
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(await testKey());
    setTesting(false);
  };

  const valid = testResult ? testResult.ok : settings.keyHealth === "ok" ? true : settings.keyHealth === "invalid" ? false : null;
  const testCopy = testing
    ? "Sending a tiny request with your Fast model…"
    : testResult && !testResult.ok
      ? testResult.error ?? "The key didn't work"
      : valid === true
        ? "Your key works"
        : valid === false
          ? "Your key was rejected"
          : "Check that your key works";

  const banner = health !== "ok" ? HEALTH_COPY[health] : null;
  const now = useNow(health === "rate_limited" && !!retryAt);
  const retryLabel =
    retryAt && now !== null ? (retryAt - now > 0 ? `Resuming in ${formatCountdown(retryAt - now)}.` : "Resuming…") : null;

  return (
    <ListGroup title="OpenRouter" footer="Your key is encrypted with your system keychain and only ever sent to OpenRouter.">
      {banner && (
        <ListRow
          icon={<AlertTriangle />}
          iconTint={health === "rate_limited" || health === "offline" ? "orange" : "red"}
          label={banner.title}
          description={
            health === "rate_limited" && retryLabel
              ? `${banner.body} ${retryLabel}`
              : health === "auth_failed" && healthMessage
                ? `${banner.body} (${healthMessage})`
                : banner.body
          }
        />
      )}
      <ListRow
        label="API key"
        description={settings.hasKey ? "Saved. Enter a new key to replace it." : "Needed for every AI feature"}
      >
        <SecureInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) void save();
          }}
          placeholder={settings.hasKey ? "••••••••••••" : "sk-or-…"}
          revealed={revealed}
          onRevealedChange={setRevealed}
          containerClassName="w-56"
          aria-label="OpenRouter API key"
        />
        {draft.trim() ? (
          <Button size="sm" onClick={save} disabled={saving} className="w-20">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
          </Button>
        ) : settings.hasKey ? (
          <Button size="sm" variant="secondary" onClick={remove} className="w-20 text-danger hover:bg-danger/15 hover:text-danger">
            Remove
          </Button>
        ) : null}
      </ListRow>
      <ListRow
        label="Test connection"
        description={<span className={cn(valid === true && "text-success", valid === false && "text-danger")}>{testCopy}</span>}
      >
        <Button
          size="sm"
          variant="secondary"
          onClick={runTest}
          disabled={testing || !settings.hasKey}
          className={cn("w-24", valid === true && "text-success", valid === false && "text-danger")}
        >
          {testing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : valid === true ? (
            <Check className="size-3.5" strokeWidth={2.5} />
          ) : valid === false ? (
            <X className="size-3.5" strokeWidth={2.5} />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          {testing ? "Testing" : valid === true ? "Valid" : valid === false ? "Failed" : "Test"}
        </Button>
      </ListRow>
      <ListRow label="Get an API key" description="openrouter.ai/keys" onClick={() => window.open("https://openrouter.ai/keys", "_blank")}>
        <ArrowRight className="size-4 text-label-tertiary" strokeWidth={1.75} />
      </ListRow>
    </ListGroup>
  );
}

/* ── Models per role ─────────────────────────────────────── */

function ModelsGroup({ settings, update }: { settings: PublicAISettings; update: Update }) {
  const { models } = useAIModels();
  const known = useMemo(() => new Set(models.map((m) => m.id)), [models]);
  const isMissing = (id: string) => models.length > 0 && !known.has(id) && !known.has(id.replace(/:[a-z]+$/, ""));
  const missingCount = MODEL_ROLES.filter((r) => isMissing(settings.models[r])).length;

  const setModel = (role: ModelRole, model: string) => void update({ models: { ...settings.models, [role]: model } });

  return (
    <ListGroup
      title="Models"
      footer={
        missingCount > 0
          ? `${missingCount} model${missingCount === 1 ? " isn't" : "s aren't"} offered by OpenRouter any more. Pick another or reset to the default.`
          : "Each AI feature uses the model for its role. Cheaper models are fine for Fast, Rewrite and Format."
      }
    >
      {MODEL_ROLES.map((role) => {
        const value = settings.models[role];
        const custom = value !== DEFAULT_MODELS[role];
        const missing = isMissing(value);
        return (
          <ListRow
            key={role}
            label={
              <span className="inline-flex items-center gap-2">
                {MODEL_ROLE_INFO[role].label}
                {missing ? <Badge variant="danger">Not found</Badge> : custom && <Badge variant="accent">Custom</Badge>}
              </span>
            }
            description={MODEL_ROLE_INFO[role].description}
          >
            {/* Fixed reset slot keeps the comboboxes aligned on the row's trailing edge. */}
            <span className="inline-flex size-7 items-center justify-center">
              {custom && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setModel(role, DEFAULT_MODELS[role])}
                  title="Reset to default"
                  aria-label={`Reset ${MODEL_ROLE_INFO[role].label} model to default`}
                  className="text-label-tertiary hover:text-label"
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              )}
            </span>
            <ModelCombobox value={value} onChange={(m) => setModel(role, m)} placeholder={DEFAULT_MODELS[role]} models={models} />
          </ListRow>
        );
      })}
    </ListGroup>
  );
}

/* ── Limits ──────────────────────────────────────────────── */

function LimitsGroup({ settings, update }: { settings: PublicAISettings; update: Update }) {
  const budgetOn = settings.dailyBudgetUsd !== undefined;
  // Remembers the last amount so switching the limit off and on restores it.
  const [lastBudget, setLastBudget] = useState(settings.dailyBudgetUsd ?? 1);
  const setBudget = (v: number) => {
    setLastBudget(v);
    void update({ dailyBudgetUsd: v });
  };

  return (
    <ListGroup title="Limits" footer="One request slot is always kept free for things you ask for directly, like Define or the assistant.">
      <ListRow label="Parallel requests" description="How many AI requests run at once">
        <NumberStepper
          value={settings.concurrency}
          min={1}
          max={12}
          label="Parallel requests"
          onValueChange={(v) => void update({ concurrency: v })}
        />
      </ListRow>
      <ListRow label="Requests per minute" description="Lower this if OpenRouter keeps rate-limiting you">
        <NumberStepper
          value={settings.requestsPerMinute}
          min={5}
          max={600}
          step={5}
          label="Requests per minute"
          onValueChange={(v) => void update({ requestsPerMinute: v })}
        />
      </ListRow>
      <ListRow label="Daily budget" description={budgetOn ? "AI pauses for the rest of the day once this is spent" : "No spending limit"}>
        {budgetOn && (
          <NumberStepper
            value={settings.dailyBudgetUsd ?? lastBudget}
            min={0.5}
            max={100}
            step={0.5}
            label="Daily budget in US dollars"
            format={(v) => `$${v.toFixed(2)}`}
            onValueChange={setBudget}
          />
        )}
        <Switch
          checked={budgetOn}
          onCheckedChange={(on) => void update({ dailyBudgetUsd: on ? lastBudget : undefined })}
          aria-label="Limit daily spending"
        />
      </ListRow>
    </ListGroup>
  );
}

/* ── Reading ─────────────────────────────────────────────── */

/** Translation targets, by BCP-47 tag, named in their own language. */
const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "nl", label: "Nederlands" },
  { code: "sv", label: "Svenska" },
  { code: "da", label: "Dansk" },
  { code: "nb", label: "Norsk" },
  { code: "fi", label: "Suomi" },
  { code: "pl", label: "Polski" },
  { code: "cs", label: "Čeština" },
  { code: "el", label: "Ελληνικά" },
  { code: "tr", label: "Türkçe" },
  { code: "ru", label: "Русский" },
  { code: "uk", label: "Українська" },
  { code: "ar", label: "العربية" },
  { code: "he", label: "עברית" },
  { code: "hi", label: "हिन्दी" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "th", label: "ไทย" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "zh-Hans", label: "简体中文" },
  { code: "zh-Hant", label: "繁體中文" },
];

/**
 * The option a stored tag selects: an exact match, else its base language ("en-US" → English), else
 * the tag itself (kept as an extra option so a hand-set value isn't lost).
 */
function languageOption(tag: string): { code: string; label: string; extra: boolean } {
  const exact = LANGUAGES.find((l) => l.code.toLowerCase() === tag.toLowerCase());
  if (exact) return { ...exact, extra: false };
  const base = LANGUAGES.find((l) => l.code === tag.split(/[-_]/)[0].toLowerCase());
  if (base) return { ...base, extra: false };
  return { code: tag, label: tag, extra: true };
}

function LanguageSelect({ value, onChange }: { value: string; onChange: (tag: string) => void }) {
  const current = languageOption(value);
  const selected = current.code;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Translate into"
          className="pressable focus-ring flex h-8 w-56 items-center justify-between gap-2 rounded-full bg-fill-tertiary pr-2.5 pl-3.5 text-left text-xs text-label shadow-[inset_0_1px_0_0_var(--glass-highlight),inset_0_0_0_0.5px_var(--glass-edge)] hover:bg-fill-secondary data-[state=open]:bg-fill-secondary"
        >
          <span className="min-w-0 truncate">{current.label}</span>
          <ChevronDown className="size-3.5 shrink-0 text-label-tertiary" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-56">
        <DropdownMenuRadioGroup
          value={selected}
          onValueChange={(code) => {
            // Picking the language already shown keeps a regional tag ("en-US").
            if (code !== selected) onChange(code);
          }}
        >
          {current.extra && <DropdownMenuRadioItem value={value}>{value}</DropdownMenuRadioItem>}
          {LANGUAGES.map((l) => (
            <DropdownMenuRadioItem key={l.code} value={l.code}>
              {l.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ReadingGroup({ settings, update }: { settings: PublicAISettings; update: Update }) {
  return (
    <ListGroup title="While reading">
      <ListRow label="Spoiler protection" description="What the wiki, tooltips and assistant may reveal">
        <SegmentedControl
          size="sm"
          value={settings.spoilerMode}
          onValueChange={(v) => void update({ spoilerMode: v })}
          options={[
            { value: "frontier", label: "Read so far" },
            { value: "position", label: "This page" },
            { value: "off", label: "Off" },
          ]}
          aria-label="Spoiler protection"
        />
      </ListRow>
      <ListRow label="Translate into" description="Language for Define and Translate">
        <LanguageSelect value={settings.targetLanguage} onChange={(tag) => void update({ targetLanguage: tag })} />
      </ListRow>
      <ListRow label="Read aloud" description="Speak the rewritten text, or always the original">
        <SegmentedControl
          size="sm"
          value={settings.readAloud}
          onValueChange={(v) => void update({ readAloud: v })}
          options={[
            { value: "displayed", label: "As shown" },
            { value: "original", label: "Original" },
          ]}
          aria-label="Read aloud"
        />
      </ListRow>
    </ListGroup>
  );
}

/* ── Usage ───────────────────────────────────────────────── */

type Window = "today" | "week" | "month";

function sinceFor(w: Window): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (w === "week") d.setDate(d.getDate() - 6);
  if (w === "month") d.setDate(d.getDate() - 29);
  return d.getTime();
}

function UsageGroup() {
  const [win, setWin] = useState<Window>("today");
  const sinceMs = useMemo(() => sinceFor(win), [win]);
  const { usage } = useAIUsage({ sinceMs });
  const rows = usage?.byTask.filter((t) => t.requests > 0) ?? [];

  return (
    <ListGroup
      title={
        <span className="flex items-center justify-between gap-3">
          Usage
          <SegmentedControl
            size="sm"
            value={win}
            onValueChange={setWin}
            options={[
              { value: "today", label: "Today" },
              { value: "week", label: "7 days" },
              { value: "month", label: "30 days" },
            ]}
            aria-label="Usage period"
          />
        </span>
      }
      footer={usage && usage.cacheHits > 0 ? `${usage.cacheHits} answers came from the cache at no cost.` : "Costs are reported by OpenRouter."}
    >
      <ListRow
        label="Total"
        description={
          usage
            ? `${usage.requests} request${usage.requests === 1 ? "" : "s"} · ${formatTokens(usage.promptTokens + usage.completionTokens)} tokens${usage.errors ? ` · ${usage.errors} failed` : ""}`
            : "Loading…"
        }
      >
        <span className="text-sm font-medium tabular-nums text-label">{usage ? formatUsd(usage.costUsd) : "—"}</span>
      </ListRow>
      {rows.map((t) => (
        <ListRow
          key={t.task}
          label={TASK_LABELS[t.task as TaskId] ?? t.task}
          description={`${t.requests} request${t.requests === 1 ? "" : "s"} · ${formatTokens(t.promptTokens + t.completionTokens)} tokens`}
        >
          <span className="text-sm tabular-nums text-label-secondary">{formatUsd(t.costUsd)}</span>
        </ListRow>
      ))}
    </ListGroup>
  );
}

/* ── Storage → AI cache ──────────────────────────────────── */

/** Storage pane group: AI cache size per feature, with per-feature and full clears. */
export function AICacheGroup() {
  const { stats, clear } = useAICacheStats();
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const run = async (key: string, task?: TaskId) => {
    setBusy(key);
    try {
      const n = await clear(task ? { task } : {});
      setStatus(`Removed ${n} cached ${n === 1 ? "answer" : "answers"}.`);
    } catch {
      setStatus("Couldn't clear the cache.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <ListGroup
      title="AI cache"
      footer={status ?? "Cached answers make repeat requests instant and free. Clearing only means they're fetched again."}
    >
      <ListRow label="All cached answers" description={stats ? `${stats.rows} entries · ${formatBytes(stats.bytes)}` : "Loading…"}>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => run("all")}
          disabled={!stats?.rows || busy !== null}
          className="w-24 text-danger hover:bg-danger/15 hover:text-danger"
        >
          {busy === "all" ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          Clear
        </Button>
      </ListRow>
      {stats?.byTask.map((t) => (
        <ListRow key={t.task} label={TASK_LABELS[t.task] ?? t.task} description={`${t.rows} entries · ${formatBytes(t.bytes)}`}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => run(t.task, t.task)}
            disabled={busy !== null}
            className="w-24 text-label-secondary hover:text-danger"
          >
            {busy === t.task ? <Loader2 className="size-3.5 animate-spin" /> : "Clear"}
          </Button>
        </ListRow>
      ))}
    </ListGroup>
  );
}

export default IntelligencePane;
