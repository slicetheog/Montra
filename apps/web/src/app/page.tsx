import Link from "next/link";
import { Wallet, PiggyBank, LineChart, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <div className="flex size-8 items-center justify-center rounded-lg bg-brand text-brand-foreground">
            <Wallet className="size-4.5" />
          </div>
          Montra
        </div>
        <nav className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/register">Get started free</Link>
          </Button>
        </nav>
      </header>

      <main id="main-content" className="flex-1">
        <section className="mx-auto flex w-full max-w-4xl flex-col items-center px-6 py-20 text-center">
          <span className="rounded-full bg-brand-tint px-3 py-1 text-xs font-medium text-brand-strong">
            Free forever · No bank connection required
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Give every dollar a job.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-foreground-muted">
            Montra is a calm, honest budgeting app. Plan your money before you spend it, see exactly what
            you can afford right now, and watch your progress toward what matters — all without handing
            your bank login to anyone.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/register">Create your free budget</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">I already have an account</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-5xl gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: PiggyBank,
              title: "Zero-based budgeting",
              body: "Assign every dollar a job the moment it arrives. Always know what's left to give away.",
            },
            {
              icon: Wallet,
              title: "Manual & CSV, your choice",
              body: "Add accounts by hand or import a statement. Your data never has to touch a third party.",
            },
            {
              icon: LineChart,
              title: "Goals & net worth",
              body: "Track savings goals, payoff debt with a plan, and watch your net worth trend over time.",
            },
            {
              icon: ShieldCheck,
              title: "Private by design",
              body: "Your balances and transactions are never shared with advertisers. Ever.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <Card key={title}>
              <CardContent className="pt-5">
                <Icon className="size-5 text-brand" />
                <h2 className="mt-3 font-semibold text-foreground">{title}</h2>
                <p className="mt-1 text-sm text-foreground-muted">{body}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-foreground-muted">
        © {new Date().getFullYear()} Montra. Free to use, always.
      </footer>
    </div>
  );
}
