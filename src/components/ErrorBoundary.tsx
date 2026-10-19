import { Component, type ErrorInfo, type ReactNode } from "react";
import { tr } from "@/i18n/ui";
import { useSettingsStore } from "@/stores/settingsStore";

interface Props {
  children: ReactNode;
  /** 폴백 UI 에 전달할 컨텍스트 라벨 (디버깅용) */
  label?: string;
  onReset?: () => void;
}

interface State {
  error: Error | null;
  info: string;
}

/**
 * E-01: 렌더 중 예외가 1건이면 React 트리가 통째로 죽어 흰 화면이 된다.
 * 리듬게임은 한 화면에 게임 루프 + 오디오 + 서비스워커가 얽혀 있어 예외 경로가 많다.
 * (navigator.share, WebAudio, SVG 속성 등) 여기서 경계를 세워 복구 가능하게 한다.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ info: info.componentStack ?? "" });
    // 콘솔에 스택 보존 (Sentry 등 후킹 지점)
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ""}]`, error, info);
  }

  private reset = () => {
    this.setState({ error: null, info: "" });
    this.props.onReset?.();
  };

  render(): ReactNode {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    // 클래스 컴포넌트라 훅을 쓸 수 없다. store 를 직접 읽는다.
    // (상위 App 가 lang 을 구독하므로 언어 변경 시 이 경계도 함께 다시 그려진다)
    const lang = useSettingsStore.getState().lang;
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[#070a12] px-6 text-center"
        role="alert"
      >
        <p className="font-display text-5xl text-rose-400">{tr(lang, "err.title")}</p>
        <p className="max-w-md text-sm leading-relaxed text-slate-300">
          {tr(lang, "err.body")}
        </p>
        <pre className="max-h-40 max-w-2xl overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-slate-900/70 p-3 text-left text-[11px] text-slate-400">
          {error.message}
          {this.props.label ? `\n\n[context] ${this.props.label}` : ""}
          {info ? `\n${info.slice(0, 600)}` : ""}
        </pre>
        <div className="flex gap-3">
          <button
            onClick={this.reset}
            className="rounded-full border border-amber-300/40 bg-amber-400/10 px-6 py-2.5 font-display text-lg text-amber-200 transition hover:bg-amber-400/20"
          >
            {tr(lang, "err.retry")}
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-full border border-white/15 bg-white/5 px-6 py-2.5 font-display text-lg text-slate-300 transition hover:bg-white/10"
          >
            {tr(lang, "err.reload")}
          </button>
        </div>
      </div>
    );
  }
}
