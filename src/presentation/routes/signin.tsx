/*
 * /signin — VISUAL ONLY. BetterAuth (STACK-4) is deferred; this form submits
 * nowhere and navigates straight to the dashboard for the design demo.
 */
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";

import { Wordmark } from "../components/wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/signin")({
  component: SignIn,
});

function SignIn() {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="space-y-8"
      >
        <div className="space-y-2">
          <Wordmark className="text-3xl" />
          <p className="text-sm text-ink-soft">Welcome back. Your words kept their schedule.</p>
        </div>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ to: "/" }); // MOCK — replace with real auth
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" required />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="password">Password</Label>
              <button type="button" className="text-xs text-ink-faint hover:text-ink">
                Forgot?
              </button>
            </div>
            <Input id="password" type="password" autoComplete="current-password" required />
          </div>
          <Button type="submit" size="lg" className="w-full">
            Sign in
          </Button>
        </form>
        <p className="text-center text-sm text-ink-faint">
          New here?{" "}
          <Link to="/signup" className="font-medium text-ink underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
