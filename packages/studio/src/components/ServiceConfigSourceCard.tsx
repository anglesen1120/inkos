import { useEffect, useState } from "react";
import { fetchJson } from "../hooks/use-api";
import { tr } from "../lib/app-language";

type ConfigSource = "env" | "studio";
type EnvScope = "project" | "global" | null;

interface EnvConfigSummary {
  detected: boolean;
  provider: string | null;
  baseUrl: string | null;
  model: string | null;
  hasApiKey: boolean;
}

interface ServiceConfigPayload {
  services: Array<Record<string, unknown>>;
  defaultModel: string | null;
  configSource: ConfigSource;
  storedConfigSource?: ConfigSource;
  envConfig: {
    project: EnvConfigSummary;
    global: EnvConfigSummary;
    effectiveSource: EnvScope;
    runtimeUsesEnv: boolean;
  };
}

export function ServiceConfigSourceCard({ onChange }: { onChange?: () => void }) {
  const [data, setData] = useState<ServiceConfigPayload | null>(null);
  const [saving, setSaving] = useState<ConfigSource | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const payload = await fetchJson<ServiceConfigPayload>("/services/config");
      setData(payload);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("读取配置来源失败", "Failed to load config source", "Không thể đọc nguồn cấu hình"));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const switchSource = async (configSource: ConfigSource) => {
    setSaving(configSource);
    try {
      await fetchJson("/services/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configSource }),
      });
      await load();
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("切换配置来源失败", "Failed to switch config source", "Không thể chuyển nguồn cấu hình"));
    } finally {
      setSaving(null);
    }
  };

  const importEnvConfig = async () => {
    setImporting(true);
    try {
      await fetchJson("/services/config/import-env", {
        method: "POST",
      });
      await load();
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("导入环境变量配置失败", "Failed to import env config", "Không thể nhập cấu hình biến môi trường"));
    } finally {
      setImporting(false);
    }
  };

  if (!data && !error) {
    return (
      <div className="rounded-xl border border-border/40 bg-card/70 p-4 text-sm text-muted-foreground/70">
        {tr("正在读取配置来源…", "Loading config source…", "Đang đọc nguồn cấu hình…")}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-4 text-sm text-amber-600">
        {error ?? tr("读取配置来源失败", "Failed to load config source", "Không thể đọc nguồn cấu hình")}
      </div>
    );
  }

  const { configSource, envConfig } = data;
  const storedConfigSource = data.storedConfigSource ?? configSource;
  const activeEnvSummary = envConfig.effectiveSource === "project" ? envConfig.project : envConfig.global;
  const envLabel = envConfig.effectiveSource === "project"
    ? tr("项目 .env", "Project .env", "`.env` dự án")
    : envConfig.effectiveSource === "global"
      ? tr("全局 ~/.inkos/.env", "Global ~/.inkos/.env", "`~/.inkos/.env` toàn cục")
      : null;
  const envDetected = envConfig.project.detected || envConfig.global.detected;

  return (
    <div className="rounded-xl border border-border/40 bg-card/70 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{tr("LLM 配置来源", "LLM config source", "Nguồn cấu hình LLM")}</div>
          <div className="text-xs text-muted-foreground/70 mt-1">
            {tr("Studio 运行时：", "Studio runtime:", "Runtime Studio:")}
            <span className="text-foreground"> {tr("使用服务页配置和 Studio 密钥", "uses service page config and Studio keys", "dùng cấu hình dịch vụ và khóa Studio")}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void switchSource("studio")}
            disabled={saving !== null || importing || configSource === "studio"}
            className="rounded-lg border border-border/50 px-3 py-1.5 text-xs hover:bg-secondary/50 disabled:opacity-50"
          >
            {saving === "studio" ? tr("切换中…", "Switching…", "Đang chuyển…") : tr("使用 Studio 配置", "Use Studio config", "Dùng cấu hình Studio")}
          </button>
          {envDetected && activeEnvSummary.hasApiKey ? (
            <button
              type="button"
              onClick={() => void importEnvConfig()}
              disabled={saving !== null || importing}
              className="rounded-lg border border-border/50 bg-secondary/40 px-3 py-1.5 text-xs hover:bg-secondary/70 disabled:opacity-50"
            >
              {importing ? tr("导入中…", "Importing…", "Đang nhập…") : tr("导入检测到的配置", "Import detected config", "Nhập cấu hình đã phát hiện")}
            </button>
          ) : null}
        </div>
      </div>

      {storedConfigSource === "env" ? (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.04] p-3 text-xs text-muted-foreground/80">
          {tr(
            "检测到旧配置标记为 `.env` 优先。Studio 运行时不会使用它；CLI、daemon 和部署环境仍可按 env 覆盖层使用。",
            "A legacy setting marks `.env` as preferred. The Studio runtime ignores it; CLI, daemon, and deployment environments may still use the env override layer.",
            "Phát hiện cấu hình cũ ưu tiên `.env`. Runtime Studio không dùng cấu hình này; CLI, daemon và môi trường triển khai vẫn có thể dùng lớp ghi đè env.",
          )}
        </div>
      ) : null}

      {envDetected ? (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.04] p-3 text-xs text-muted-foreground/80 space-y-1.5">
          <div className="text-foreground">
            {tr("检测到 LLM 环境变量覆盖：", "Detected LLM environment variable override:", "Đã phát hiện biến môi trường LLM ghi đè:")}
            <span className="font-medium"> {envLabel ?? tr("已检测到但未定位来源", "detected but source not located", "đã phát hiện nhưng chưa xác định nguồn")}</span>
          </div>
          {activeEnvSummary.baseUrl ? <div>{tr("基础 URL", "Base URL", "URL cơ sở")}: <span className="font-mono text-foreground">{activeEnvSummary.baseUrl}</span></div> : null}
          {activeEnvSummary.model ? <div>{tr("模型", "Model", "Mô hình")}: <span className="font-mono text-foreground">{activeEnvSummary.model}</span></div> : null}
          {activeEnvSummary.provider ? <div>{tr("提供方", "Provider", "Nhà cung cấp")}: <span className="font-mono text-foreground">{activeEnvSummary.provider}</span></div> : null}
          <div>{tr("API Key", "API Key", "Khóa API")}: <span className="text-foreground">{activeEnvSummary.hasApiKey ? tr("已设置", "set", "đã thiết lập") : tr("未设置", "not set", "chưa thiết lập")}</span></div>
          <div className="text-muted-foreground/70 pt-1">
            {tr(
              "当前虽然检测到 .env，但 Studio 和 Agent 请求不会直接使用这套覆盖；点击“导入检测到的配置”后，会把它保存为 Studio 服务配置。",
              "A .env override was detected, but Studio and agent requests do not use it directly. Click “Import detected config” to save it as Studio service config.",
              "Dù đã phát hiện ghi đè .env, các yêu cầu của Studio và Agent không dùng trực tiếp cấu hình này. Nhấn “Nhập cấu hình đã phát hiện” để lưu thành cấu hình dịch vụ Studio.",
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border/30 bg-secondary/20 p-3 text-xs text-muted-foreground/75">
          {tr(
            "未检测到目录或全局 `.env` 里的 LLM 覆盖变量。当前会直接使用项目配置和 Studio 服务配置。",
            "No LLM override variables detected in the project or global `.env`. Project config and Studio service config are used directly.",
            "Không phát hiện biến LLM ghi đè trong `.env` của dự án hoặc toàn cục. Hiện dùng trực tiếp cấu hình dự án và dịch vụ Studio.",
          )}
        </div>
      )}

      {error ? (
        <div className="text-xs text-rose-500">{error}</div>
      ) : null}
    </div>
  );
}
