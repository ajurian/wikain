import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import {
  resolvePromptFn,
  startSessionFn,
  submitReviewFn,
  type ReviewOutcome,
} from "../server/review";
import type { ReviewPrompt } from "../../application/resolveReviewPrompt.js";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export const Route = createFileRoute("/review")({
  component: ReviewRoute,
});

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center p-6">
      {children}
    </main>
  );
}

function ReviewRoute() {
  const [queue, setQueue] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);

  const start = useMutation({
    mutationFn: () => startSessionFn(),
    onSuccess: (data) => {
      setQueue(data.queue);
      setIndex(0);
    },
  });

  if (queue === null) {
    return (
      <Centered>
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Ready to review</CardTitle>
            <CardDescription>
              We&rsquo;ll seed a couple of new words and surface anything due, then walk them one at a
              time.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => start.mutate()} disabled={start.isPending}>
              {start.isPending ? "Starting…" : "Start reviewing"}
            </Button>
          </CardFooter>
        </Card>
      </Centered>
    );
  }

  if (queue.length === 0) {
    return (
      <Centered>
        <Card className="w-full text-center">
          <CardHeader>
            <CardTitle>Nothing to review</CardTitle>
            <CardDescription>No new or due words right now. Come back later.</CardDescription>
          </CardHeader>
        </Card>
      </Centered>
    );
  }

  if (index >= queue.length) {
    return (
      <Centered>
        <Card className="w-full text-center">
          <CardHeader>
            <CardTitle>Session complete</CardTitle>
            <CardDescription>You worked through {queue.length} words.</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button
              variant="outline"
              onClick={() => {
                setQueue(null);
                setIndex(0);
                start.reset();
              }}
            >
              Start another session
            </Button>
          </CardFooter>
        </Card>
      </Centered>
    );
  }

  const senseId = queue[index];
  if (senseId === undefined) return null;

  return (
    <Centered>
      <ReviewStep
        key={senseId}
        senseId={senseId}
        position={index + 1}
        total={queue.length}
        onNext={() => setIndex((i) => i + 1)}
      />
    </Centered>
  );
}

function ReviewStep({
  senseId,
  position,
  total,
  onNext,
}: {
  senseId: string;
  position: number;
  total: number;
  onNext: () => void;
}) {
  const prompt = useQuery({
    queryKey: ["prompt", senseId],
    queryFn: () => resolvePromptFn({ data: senseId }),
  });
  const [response, setResponse] = useState("");
  const submit = useMutation({
    mutationFn: (value: string) => submitReviewFn({ data: { senseId, response: value } }),
  });

  if (prompt.isPending) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (prompt.error) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Couldn&rsquo;t load this word</CardTitle>
          <CardDescription>{String(prompt.error)}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" onClick={onNext}>
            Skip
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const p = prompt.data;
  const outcome = submit.data;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardDescription>
          Word {position} of {total} &middot; {TIER_LABEL[p.tier]}
        </CardDescription>
        <CardTitle>{INSTRUCTION[p.tier]}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {outcome ? (
          <Outcome outcome={outcome} />
        ) : (
          <PromptBody prompt={p} response={response} setResponse={setResponse} />
        )}
        {submit.error ? (
          <p className="text-sm text-destructive">{String(submit.error)}</p>
        ) : null}
      </CardContent>
      <CardFooter>
        {outcome ? (
          <Button onClick={onNext}>{position < total ? "Next word" : "Finish"}</Button>
        ) : (
          <Button
            onClick={() => submit.mutate(response)}
            disabled={response.trim().length === 0 || submit.isPending || p.tier === "free"}
          >
            {submit.isPending ? "Checking…" : "Submit"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

const TIER_LABEL: Record<ReviewPrompt["tier"], string> = {
  recognition: "Recognize",
  cloze: "Recall in context",
  cued: "Produce",
  free: "Free production",
};

const INSTRUCTION: Record<ReviewPrompt["tier"], string> = {
  recognition: "Which word fits this meaning?",
  cloze: "Fill in the missing word.",
  cued: "Type the word for this meaning.",
  free: "Write a sentence using this word.",
};

function PromptBody({
  prompt,
  response,
  setResponse,
}: {
  prompt: ReviewPrompt;
  response: string;
  setResponse: (v: string) => void;
}) {
  switch (prompt.tier) {
    case "recognition":
      return (
        <div className="space-y-4">
          <p className="text-lg font-medium">{prompt.meaning}</p>
          <RadioGroup value={response} onValueChange={setResponse}>
            {prompt.options.map((opt) => (
              <Label
                key={opt}
                htmlFor={opt}
                className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-accent"
              >
                <RadioGroupItem id={opt} value={opt} />
                {opt}
              </Label>
            ))}
          </RadioGroup>
        </div>
      );
    case "cloze":
      return (
        <div className="space-y-4">
          <p className="text-lg">{prompt.clozedSentence.replace("_", "―――")}</p>
          <Input
            autoFocus
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="the missing word"
          />
        </div>
      );
    case "cued":
      return (
        <div className="space-y-4">
          <p className="text-lg font-medium">{prompt.meaning}</p>
          {prompt.selfReferencePrompt ? (
            <p className="text-sm text-muted-foreground">{prompt.selfReferencePrompt}</p>
          ) : null}
          <Input
            autoFocus
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="the word"
          />
        </div>
      );
    case "free":
      return (
        <div className="space-y-2">
          <p className="text-lg font-medium">{prompt.meaning}</p>
          <p className="text-sm text-muted-foreground">
            Free production (judged) isn&rsquo;t interactive yet in this build.
          </p>
        </div>
      );
  }
}

function Outcome({ outcome }: { outcome: ReviewOutcome }) {
  return (
    <div className="flex items-center gap-3">
      {outcome.passed ? (
        <CheckCircle2 className="size-6 text-success" />
      ) : (
        <XCircle className="size-6 text-destructive" />
      )}
      <div>
        <p className="font-medium">{outcome.passed ? "Correct" : "Not quite"}</p>
        <p className="text-sm text-muted-foreground">Mastery: {outcome.mastery}</p>
      </div>
    </div>
  );
}
