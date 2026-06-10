import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { StepHeader } from "../components/StepHeader";

export function RemoteAsk({
  onYes,
  onNo,
}: {
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <Card className="p-8">
      <StepHeader
        title="Got a Docker host on another machine?"
        subtitle="If you've got a home lab, a server, or any other computer running Docker, I can wire up an SSH tunnel so Claude on this Mac can drive containers over there. Totally optional."
      />

      <div className="grid grid-cols-2 gap-4 mb-2">
        <button
          onClick={onYes}
          className="text-left rounded-2xl bg-navy-800/60 hover:bg-navy-700/60 border border-navy-700/50 hover:border-whale-500/50 p-5 transition-all active:scale-[0.99]"
        >
          <div className="text-whale-400 text-2xl mb-2">🛰️</div>
          <div className="font-medium text-white">Yes, hook up a remote host</div>
          <div className="text-whale-200/60 text-xs mt-1">
            I'll generate a setup script you'll run on the remote machine, then test the connection.
          </div>
        </button>

        <button
          onClick={onNo}
          className="text-left rounded-2xl bg-navy-800/60 hover:bg-navy-700/60 border border-navy-700/50 hover:border-buddy-500/50 p-5 transition-all active:scale-[0.99]"
        >
          <div className="text-buddy-400 text-2xl mb-2">🏠</div>
          <div className="font-medium text-white">Local only for now</div>
          <div className="text-whale-200/60 text-xs mt-1">
            Use Claude with Docker on this Mac only. You can add a remote host anytime by re-opening DockerBuddy.
          </div>
        </button>
      </div>
    </Card>
  );
}
