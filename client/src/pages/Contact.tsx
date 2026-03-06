import { useState } from "react";
import Layout from "../components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2 } from "lucide-react";
import { useSEO } from "@/hooks/use-seo";
import { apiRequest } from "@/lib/queryClient";

export default function Contact() {
  useSEO({
    title: "Contact | QuitReady",
    description: "Have a question about your report or the QuitReady tool? Send us a message and we'll get back to you.",
  });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; message?: string }>({});

  const validate = () => {
    const errors: { email?: string; message?: string } = {};
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'A valid email address is required.';
    }
    if (!message.trim() || message.trim().length < 10) {
      errors.message = 'Please enter at least 10 characters.';
    }
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setError('');
    setSubmitting(true);
    try {
      const res = await apiRequest('POST', '/api/contact', {
        name: name.trim() || undefined,
        email: email.trim(),
        message: message.trim(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to send message.');
      }
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="flex-1 bg-muted/20 py-16 px-4">
        <div className="max-w-lg mx-auto">

          <div className="mb-10">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">Support</p>
            <h1 className="text-3xl font-bold font-serif text-foreground mb-3">Contact Us</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Questions about your report, a technical issue, or something else? Send us a message and we'll get back to you.
            </p>
          </div>

          {submitted ? (
            <div className="border border-border rounded-xl bg-white shadow-sm p-8 text-center" data-testid="contact-success">
              <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-4" />
              <h2 className="text-lg font-bold font-serif text-foreground mb-2">Message sent</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We received your message and will respond to <span className="font-medium text-foreground">{email}</span> shortly.
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="border border-border rounded-xl bg-white shadow-sm p-8 space-y-5"
              noValidate
            >
              <div>
                <label htmlFor="contact-name" className="block text-xs font-medium text-foreground mb-1.5">
                  Name <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Input
                  id="contact-name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="input-contact-name"
                  autoComplete="name"
                />
              </div>

              <div>
                <label htmlFor="contact-email" className="block text-xs font-medium text-foreground mb-1.5">
                  Email address <span className="text-destructive">*</span>
                </label>
                <Input
                  id="contact-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) setFieldErrors(f => ({ ...f, email: undefined }));
                  }}
                  className={fieldErrors.email ? 'border-destructive' : ''}
                  data-testid="input-contact-email"
                  autoComplete="email"
                />
                {fieldErrors.email && (
                  <p className="text-[11px] text-destructive mt-1">{fieldErrors.email}</p>
                )}
              </div>

              <div>
                <label htmlFor="contact-message" className="block text-xs font-medium text-foreground mb-1.5">
                  Message <span className="text-destructive">*</span>
                </label>
                <Textarea
                  id="contact-message"
                  placeholder="Describe your question or issue…"
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    if (fieldErrors.message) setFieldErrors(f => ({ ...f, message: undefined }));
                  }}
                  className={`min-h-[140px] resize-y ${fieldErrors.message ? 'border-destructive' : ''}`}
                  data-testid="input-contact-message"
                />
                {fieldErrors.message && (
                  <p className="text-[11px] text-destructive mt-1">{fieldErrors.message}</p>
                )}
              </div>

              {error && (
                <p className="text-sm text-destructive" data-testid="contact-error">{error}</p>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="w-full"
                data-testid="button-contact-submit"
              >
                {submitting ? 'Sending…' : 'Send Message'}
              </Button>

              <p className="text-[11px] text-muted-foreground/60 text-center leading-relaxed">
                We typically respond within one business day.
              </p>
            </form>
          )}

        </div>
      </div>
    </Layout>
  );
}
