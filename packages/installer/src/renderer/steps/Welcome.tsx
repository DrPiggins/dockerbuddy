import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Mascot } from "../components/Mascot";

export function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <Card className="p-10 text-center">
      <div className="flex justify-center mb-6">
        <Mascot size={120} />
      </div>
      <h1 className="text-4xl font-semibold tracking-tight mb-3">
        Hi, I'm <span className="text-whale-400">Buddy</span>.
      </h1>
      <p className="text-whale-100/80 text-lg mb-2">
        I'll get Docker talking to Claude Code in a few clicks.
      </p>
      <p className="text-whale-200/50 text-sm mb-10 max-w-md mx-auto leading-relaxed">
        Once I'm done, you'll be able to open <span className="font-mono text-whale-300">claude</span> in
        any terminal and say <span className="italic">"what's running"</span> —
        and Claude will know. We can even hook up a Docker host on another
        machine (like a home lab) if you have one.
      </p>
      <Button onClick={onNext} className="px-8 py-3 text-base">
        Let's go →
      </Button>
    </Card>
  );
}
