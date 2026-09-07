"use client";

import { useMemo, useState } from "react";
import { LifeBuoy, Search } from "lucide-react";
import { HELP_CATEGORIES, type HelpArticle, type HelpCategory } from "@/lib/help-content";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchHit {
  categoryTitle: string;
  article: HelpArticle;
}

function searchArticles(query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const category of HELP_CATEGORIES) {
    for (const article of category.articles) {
      if (article.question.toLowerCase().includes(q) || article.answer.toLowerCase().includes(q)) {
        hits.push({ categoryTitle: category.title, article });
      }
    }
  }
  return hits;
}

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState(HELP_CATEGORIES[0].id);
  const searchHits = useMemo(() => searchArticles(query), [query]);
  const isSearching = query.trim().length > 0;
  const activeCategory = HELP_CATEGORIES.find((c) => c.id === activeCategoryId) ?? HELP_CATEGORIES[0];

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-1 flex items-center gap-2">
        <LifeBuoy className="size-5 text-brand" />
        <h1 className="text-xl font-semibold">Help Center</h1>
      </div>
      <p className="mb-4 text-sm text-foreground-muted">
        How every part of Montra works, in plain language. Look something up below, or browse by topic.
      </p>

      <div className="relative mb-6 max-w-lg">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the help center…"
          className="pl-9"
          aria-label="Search help articles"
        />
      </div>

      {isSearching ? (
        <SearchResults query={query} hits={searchHits} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
          <nav aria-label="Help topics" className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {HELP_CATEGORIES.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategoryId(category.id)}
                aria-current={category.id === activeCategoryId ? "true" : undefined}
                className={cn(
                  "shrink-0 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors lg:shrink",
                  category.id === activeCategoryId
                    ? "bg-brand-tint text-brand-strong"
                    : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
                )}
              >
                {category.title}
              </button>
            ))}
          </nav>

          <CategoryArticles category={activeCategory} />
        </div>
      )}
    </div>
  );
}

function CategoryArticles({ category }: { category: HelpCategory }) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{category.title}</h2>
      <p className="mb-4 text-sm text-foreground-muted">{category.description}</p>
      <div className="flex flex-col gap-2">
        {category.articles.map((article) => (
          <ArticleDisclosure key={article.id} article={article} />
        ))}
      </div>
    </div>
  );
}

function ArticleDisclosure({ article, defaultOpen }: { article: HelpArticle; defaultOpen?: boolean }) {
  return (
    <Card>
      <details className="group" open={defaultOpen}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          {article.question}
          <span className="shrink-0 text-foreground-muted transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <p className="px-4 pb-4 text-sm text-foreground-muted">{article.answer}</p>
      </details>
    </Card>
  );
}

function SearchResults({ query, hits }: { query: string; hits: SearchHit[] }) {
  if (hits.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">
        No results for &ldquo;{query}&rdquo;. Try a different word, or browse by topic below.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-foreground-muted">
        {hits.length} result{hits.length === 1 ? "" : "s"} for &ldquo;{query}&rdquo;
      </p>
      {hits.map((hit) => (
        <div key={hit.article.id}>
          <p className="mb-1 text-xs font-medium text-brand">{hit.categoryTitle}</p>
          <ArticleDisclosure article={hit.article} defaultOpen />
        </div>
      ))}
    </div>
  );
}
