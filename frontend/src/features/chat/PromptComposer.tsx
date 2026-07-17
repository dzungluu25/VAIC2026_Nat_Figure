import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { useAgentStream } from "../../hooks/useAgentStream";
import { SAMPLE_PROMPTS } from "./samplePrompts";
import styles from "./PromptComposer.module.css";

export const PromptComposer = () => {
  const [prompt, setPrompt] = useState("");
  const { run, phase } = useAgentStream();
  const isRunning = phase === "running";

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!prompt.trim() || isRunning) return;
    void run(prompt);
  };

  return (
    <Card title="Yêu cầu thẩm định">
      <form className={styles.form} onSubmit={handleSubmit}>
        <textarea
          className={styles.textarea}
          placeholder="Nhập yêu cầu thẩm định tín dụng, ví dụ: “Thẩm định hồ sơ vay mua nhà của anh Hùng, khoản vay 2.8 tỷ VND”…"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          disabled={isRunning}
          rows={3}
        />
        <div className={styles.footer}>
          <div className={styles.chips}>
            {SAMPLE_PROMPTS.map(sample => (
              <button
                key={sample.label}
                type="button"
                className={styles.chip}
                disabled={isRunning}
                onClick={() => setPrompt(sample.prompt)}
              >
                {sample.label}
              </button>
            ))}
          </div>
          <Button type="submit" isLoading={isRunning} disabled={!prompt.trim()}>
            <Send size={15} />
            {isRunning ? "Đang điều phối…" : "Bắt đầu thẩm định"}
          </Button>
        </div>
      </form>
    </Card>
  );
};
