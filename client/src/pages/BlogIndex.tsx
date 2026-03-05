import Layout from "../components/Layout";
import { Link } from "wouter";
import { blogPosts } from "../data/blog-posts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSEO } from "../hooks/use-seo";
import { Calendar, Clock, ArrowRight } from "lucide-react";

export default function BlogIndex() {
  useSEO({
    title: "Financial Independence Blog — Quit Your Job Calculator | QuitReady",
    description: "Expert financial analysis and calculators for planning your career exit. Learn how to calculate runway, manage healthcare, and survive self-employment taxes.",
    ogType: "website",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Blog",
      "name": "QuitReady Financial Independence Blog",
      "description": "Strategies and math for professionals transitioning from W-2 to self-employment.",
      "url": "https://quitready.com/blog"
    }
  });

  const sortedPosts = [...blogPosts].sort((a, b) => 
    new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime()
  );

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-12 md:py-20">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
            The Structural Exit Blog
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Practical math and conservative strategies for the transition from W-2 to independence.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {sortedPosts.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`}>
              <Card className="h-full flex flex-col hover-elevate cursor-pointer group transition-all">
                <CardHeader className="flex-1">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(post.publishDate).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric' 
                      })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {post.readMinutes} min read
                    </span>
                  </div>
                  <CardTitle className="text-xl group-hover:text-primary transition-colors">
                    {post.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                    {post.excerpt}
                  </p>
                  <div className="flex items-center text-sm font-semibold text-primary">
                    Read Article <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <Card className="bg-primary/5 border-primary/20 p-8 md:p-12 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">Ready to find your number?</h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Our engine stress-tests your specific finances against 4 different scenarios to see exactly when your runway runs out.
          </p>
          <Link href="/app">
            <Button size="lg" className="px-8 font-bold">
              Generate Your Personalized Report
            </Button>
          </Link>
          <p className="text-xs text-muted-foreground mt-4">
            $19.99 one-time · Instant 17-page PDF · U.S. Specific Math
          </p>
        </Card>
      </div>
    </Layout>
  );
}
