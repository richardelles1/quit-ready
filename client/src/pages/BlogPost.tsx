import Layout from "../components/Layout";
import { useRoute, Link } from "wouter";
import { getPost } from "../data/blog-posts";
import { useSEO } from "../hooks/use-seo";
import { Calendar, Clock, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import NotFound from "./not-found";

export default function BlogPost() {
  const [, params] = useRoute("/blog/:slug");
  const post = params?.slug ? getPost(params.slug) : null;

  if (!post) {
    return <NotFound />;
  }

  useSEO({
    title: `${post.title} | QuitReady`,
    description: post.metaDescription,
    ogType: "article",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": post.title,
      "datePublished": post.publishDate,
      "description": post.metaDescription,
      "author": {
        "@type": "Organization",
        "name": "QuitReady Editorial"
      },
      "publisher": {
        "@type": "Organization",
        "name": "QuitReady",
        "logo": {
          "@type": "ImageObject",
          "url": "https://quitready.app/logo.png"
        }
      }
    }
  });

  return (
    <Layout>
      <article className="max-w-3xl mx-auto px-4 py-12 md:py-20">
        <Link href="/blog">
          <Button variant="ghost" size="sm" className="mb-8 -ml-2 text-muted-foreground hover:text-foreground no-default-hover-elevate">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Blog
          </Button>
        </Link>

        <header className="mb-10">
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {new Date(post.publishDate).toLocaleDateString('en-US', { 
                month: 'long', 
                day: 'numeric', 
                year: 'numeric' 
              })}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {post.readMinutes} min read
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight mb-6">
            {post.title}
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed italic border-l-4 border-primary/20 pl-6">
            {post.excerpt}
          </p>
        </header>

        <div className="prose prose-slate dark:prose-invert max-w-none">
          {post.sections.map((section, idx) => (
            <div key={idx} className="mb-8">
              {section.heading && (
                <h2 className="text-2xl font-bold mt-12 mb-6 scroll-m-20 border-b pb-2 tracking-tight first:mt-0">
                  {section.heading}
                </h2>
              )}
              
              {section.isCTA ? (
                <Card className="my-12 p-8 bg-primary/5 border-primary/20 text-center">
                  <p className="text-lg font-medium mb-6" dangerouslySetInnerHTML={{ __html: section.body.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-primary hover:underline underline-offset-4">$1</a>') }} />
                  <Link href="/app">
                    <Button size="lg" className="font-bold">
                      Run Your Structural Analysis
                    </Button>
                  </Link>
                </Card>
              ) : (
                <div 
                  className="text-lg leading-relaxed text-foreground/90 space-y-4"
                  dangerouslySetInnerHTML={{ __html: section.body.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-primary hover:underline underline-offset-4 font-medium">$1</a>') }}
                />
              )}
            </div>
          ))}
        </div>

        <footer className="mt-16 pt-10 border-t border-border">
          <Card className="p-8 md:p-12 text-center bg-card">
            <h3 className="text-2xl font-bold mb-4">Know your number before you quit.</h3>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              Our simulation engine handles the COBRA cliff, self-employment tax math, and ACA subsidy projections so you don't have to.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/app">
                <Button size="lg" className="w-full sm:w-auto px-8 font-bold">
                  Generate Your Report
                </Button>
              </Link>
              <Link href="/sample-report">
                <Button variant="outline" size="lg" className="w-full sm:w-auto px-8">
                  View Sample Report
                </Button>
              </Link>
            </div>
            <p className="text-xs text-muted-foreground mt-6">
              $19.99 · Instant 17-page PDF · One-time purchase
            </p>
          </Card>
        </footer>
      </article>
    </Layout>
  );
}
