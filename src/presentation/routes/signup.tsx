/*
 * /signup — VISUAL ONLY. BetterAuth (STACK-4) is deferred; this form submits
 * nowhere and hands off to onboarding (SEED-1: first win comes right away).
 */
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";

import { Wordmark } from "../components/wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/signup")({
  component: SignUp,
});

function SignUp() {
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
          <p className="text-sm leading-relaxed text-ink-soft">
            Your first written sentence is two minutes away.
          </p>
        </div>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ to: "/onboarding" }); // MOCK — replace with real auth
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" autoComplete="name" placeholder="Your name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="new-password" required />
          </div>
          <Button type="submit" size="lg" className="w-full">
            Create account
          </Button>
        </form>
        <p className="text-center text-sm text-ink-faint">
          Already have an account?{" "}
          <Link to="/signin" className="font-medium text-ink underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
