'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import {
  ArrowRight,
  Database,
  Sparkles,
  BarChart3,
  Shield,
  Clock,
  GitBranch,
  Key,
  ChevronRight,
  CheckCircle2,
  Zap,
  TrendingUp,
  Users,
  DollarSign,
  Gauge,
  Brain,
  Lock,
  AlertCircle,
  PlayCircle,
  Calculator,
  ChevronDown,
  Minus,
  Plus,
  X,
  Star,
  Rocket,
} from 'lucide-react';
import { ConnectorSwitcher } from '@/components/ConnectorSwitcher';
import { Button, Card } from '@/components/ui/design-system';

export default function Page() {
  const [activeTab, setActiveTab] = useState('connect');
  const [roiInputs, setRoiInputs] = useState({
    monthlyDataSpend: 50000,
    analysts: 3,
    dashboards: 20,
    timeToInsight: 5,
  });
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  // Calculate ROI
  const calculateROI = () => {
    const annualSavings =
      roiInputs.analysts * 120000 * 0.4 + // 40% time savings
      roiInputs.monthlyDataSpend * 12 * 0.25 + // 25% efficiency gain
      roiInputs.dashboards * 5000 * 6; // 6x faster dashboard creation
    const annualCost = 99 * 12 * 10; // Assuming 10 users at $99/month
    const roi = Math.round(((annualSavings - annualCost) / annualCost) * 100);
    return { savings: annualSavings, roi };
  };

  const { savings, roi } = calculateROI();

  const problems = [
    {
      icon: Clock,
      title: 'Weeks to Get Answers',
      description:
        'Your data team is overwhelmed with ad-hoc requests. Business users wait weeks for simple reports.',
      stat: '72%',
      statLabel: 'of teams wait >1 week for insights',
    },
    {
      icon: DollarSign,
      title: 'Expensive Data Stack',
      description:
        'Multiple tools, complex integrations, and specialized talent drain your budget with minimal ROI.',
      stat: '$180K',
      statLabel: 'average annual data tool spend',
    },
    {
      icon: AlertCircle,
      title: 'Ungoverned Metrics',
      description:
        'Different teams calculate the same metrics differently. No single source of truth.',
      stat: '43%',
      statLabel: 'of decisions based on incorrect data',
    },
  ];

  const benefits = [
    {
      icon: Gauge,
      metric: '10x',
      title: 'Faster Time to Insights',
      description:
        'From weeks to minutes. Natural language queries instantly translated to optimized SQL.',
    },
    {
      icon: TrendingUp,
      metric: '67%',
      title: 'Increase in Data Adoption',
      description: 'Non-technical users self-serve analytics without SQL knowledge or training.',
    },
    {
      icon: DollarSign,
      metric: '40%',
      title: 'Reduction in Tool Costs',
      description:
        'Replace your fragmented stack with one unified platform. No more integration headaches.',
    },
    {
      icon: Shield,
      metric: '100%',
      title: 'Governance Coverage',
      description:
        'Every metric defined once, used everywhere. Complete audit trail and PII protection.',
    },
  ];

  const useCases = [
    {
      industry: 'SaaS',
      title: 'Track MRR, Churn & LTV',
      description:
        'Pre-built semantic models for SaaS metrics. Connect Stripe and get instant cohort analysis.',
      metrics: ['MRR Growth', 'Net Revenue Retention', 'CAC Payback', 'Cohort LTV'],
    },
    {
      industry: 'E-commerce',
      title: 'Optimize Conversion & AOV',
      description:
        'Understand your funnel, product performance, and customer segments in real-time.',
      metrics: ['Conversion Rate', 'Cart Abandonment', 'Product Velocity', 'Customer Segments'],
    },
    {
      industry: 'Healthcare',
      title: 'Compliance & Operations',
      description:
        'Track caregiver compliance, patient outcomes, and operational efficiency with HIPAA compliance.',
      metrics: [
        'Compliance Rate',
        'Patient Satisfaction',
        'Resource Utilization',
        'Clinical Outcomes',
      ],
    },
    {
      industry: 'Marketing',
      title: 'Multi-Channel Attribution',
      description:
        'Connect all your marketing data sources. Understand true CAC and channel performance.',
      metrics: ['Channel ROAS', 'Attribution Models', 'Customer Journey', 'Campaign Performance'],
    },
  ];

  const faqs = [
    {
      question: 'How does Elev8 connect to my data sources?',
      answer:
        'We support secure connections to Snowflake, Xero, MS SQL, MySQL, PostgreSQL, Spendesk, Azure SQL, Salesforce, BigQuery, Redshift, and Databricks. Your data never leaves your systems - we only store metadata and query results are cached temporarily for performance.',
    },
    {
      question: 'What makes your NL→SQL different?',
      answer:
        'Our AI understands your specific schema, relationships, and business context through the semantic layer. It generates optimized, validated SQL with guardrails to prevent runaway queries. Every query is logged and can be reviewed.',
    },
    {
      question: 'How long does implementation take?',
      answer:
        'Initial setup takes under 10 minutes. Connect your data source, and we auto-discover your schema. Most teams have their first dashboard live within an hour. Full semantic layer setup typically takes 1-2 days with our guided process.',
    },
    {
      question: 'Can non-technical users really use this?',
      answer:
        "Absolutely. Users can ask questions in plain English like 'Show me revenue by product last quarter' or 'Which customers are at risk of churning?' No SQL knowledge required. The semantic layer ensures consistent, accurate results.",
    },
    {
      question: 'What about data security and compliance?',
      answer:
        "We're SOC2 Type II certified. Your data stays in your source systems. We support PII tagging, field-level masking, row-level security, and complete audit trails. GDPR and HIPAA compliant configurations available.",
    },
    {
      question: 'How does pricing work?',
      answer:
        'We offer transparent, seat-based pricing starting at $99/user/month for teams. No hidden fees for queries or data volume. Enterprise plans include custom semantic models, dedicated support, and SLAs.',
    },
  ];

  return (
    <>
      {/* Enhanced Hero Section */}
      <section className="relative min-h-[110vh] flex items-center section overflow-hidden">
        {/* Premium animated background */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 left-10 w-[40rem] h-[40rem] bg-primary/30 rounded-full blur-3xl animate-float-slow" />
          <div className="absolute bottom-20 right-10 w-[50rem] h-[50rem] bg-accent/25 rounded-full blur-3xl animate-float-slow animation-delay-2000" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80rem] h-[80rem] bg-gradient-radial from-primary/15 via-accent/10 to-transparent rounded-full blur-3xl animate-glow-pulse" />
          {/* Additional floating particles */}
          <div className="absolute top-1/4 right-1/4 w-32 h-32 bg-primary/20 rounded-full blur-2xl animate-float" />
          <div className="absolute bottom-1/4 left-1/4 w-24 h-24 bg-accent/20 rounded-full blur-2xl animate-float animation-delay-1000" />
        </div>

        <div className="container">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Content */}
            <div className="reveal animate-slide-up">
              <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full glass-card-premium text-sm mb-8 shadow-glow animate-float">
                <Rocket className="w-5 h-5 text-accent animate-pulse" />
                <span className="font-semibold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent uppercase tracking-wider">
                  AI-Powered Analytics Platform
                </span>
                <span className="px-3 py-1 rounded-full bg-gradient-to-r from-accent to-accent-hover text-background text-xs font-bold shadow-lg animate-pulse">
                  NEW
                </span>
              </div>

              <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-display font-black leading-[0.9] tracking-tight">
                <span className="block text-foreground mb-4 drop-shadow-2xl">Turn your</span>
                <div className="block my-4">
                  <ConnectorSwitcher />
                </div>
                <span className="block text-foreground mt-4 drop-shadow-2xl">into insights</span>
                <span className="block text-3xl sm:text-4xl lg:text-5xl bg-gradient-to-br from-muted-foreground to-foreground bg-clip-text text-transparent font-bold mt-6">
                  in minutes, not weeks
                </span>
              </h1>

              <p className="mt-6 text-base sm:text-lg text-foreground-muted max-w-xl leading-relaxed">
                The only analytics platform that combines{' '}
                <span className="text-foreground font-medium">natural language queries</span>, a{' '}
                <span className="text-foreground font-medium">governed semantic layer</span>, and
                <span className="text-foreground font-medium"> enterprise-grade security</span> —
                purpose-built for modern data teams.
              </p>

              <div className="mt-12 flex flex-col sm:flex-row gap-6">
                <Button variant="primary" size="lg" asChild>
                  <Link href="/signup">Start Free Trial</Link>
                </Button>
                <Button variant="secondary" size="lg">
                  <PlayCircle className="w-6 h-6 text-primary" />
                  Watch 3-min Demo
                </Button>
              </div>

              <div className="mt-8 flex flex-wrap gap-6 text-sm text-foreground-subtle">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  Setup in 10 minutes
                </span>
                <span className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  SOC2 Type II
                </span>
                <span className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-accent" />
                  500+ teams trust us
                </span>
              </div>
            </div>

            {/* Premium Dashboard Preview */}
            <div className="relative reveal animate-slide-up" style={{ animationDelay: '400ms' }}>
              <div className="relative group transform hover:scale-[1.03] transition-all duration-700">
                <div className="absolute -inset-8 bg-gradient-to-r from-primary/40 via-accent/30 to-primary/40 rounded-3xl blur-3xl group-hover:blur-2xl transition-all duration-700 animate-glow-pulse" />
                <div className="relative glass-card-premium p-4 shadow-4xl">
                  <img
                    src="/dashboard-mockup.svg"
                    alt="Analytics Dashboard"
                    className="relative rounded-xl w-full h-auto"
                  />
                  <div className="absolute bottom-6 right-6 glass-card-premium px-6 py-3 shadow-2xl animate-float">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 bg-gradient-to-r from-accent to-primary rounded-full animate-pulse shadow-glow-accent"></span>
                      <span className="font-bold bg-gradient-to-r from-accent to-primary bg-clip-text text-transparent">
                        Live Demo Available
                      </span>
                    </div>
                  </div>
                </div>
                {/* Floating elements */}
                <div className="absolute -top-6 -left-6 w-12 h-12 bg-primary/40 rounded-full blur-xl animate-float"></div>
                <div className="absolute -bottom-8 -right-8 w-16 h-16 bg-accent/40 rounded-full blur-xl animate-float-slow"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="section relative bg-background-secondary/30">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold mb-4">
              Your data stack is
              <span className="text-destructive"> broken</span>
            </h2>
            <p className="text-lg text-foreground-muted max-w-2xl mx-auto">
              Traditional BI tools weren't built for modern cloud warehouses. You need a better way.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {problems.map((problem, i) => (
              <div
                key={problem.title}
                className="reveal animate-slide-up"
                style={{ animationDelay: `${i * 150}ms` }}
              >
                <Card
                  variant="elevated"
                  padding="lg"
                  className="h-full hover:scale-110 hover:shadow-3xl hover:border-destructive/30 transition-all duration-500 group"
                >
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-destructive/20 to-destructive/10 inline-block mb-6 group-hover:animate-pulse shadow-lg">
                    <problem.icon className="w-8 h-8 text-destructive drop-shadow-glow" />
                  </div>

                  <h3 className="text-2xl font-bold mb-4 bg-gradient-to-r from-foreground to-destructive bg-clip-text text-transparent">
                    {problem.title}
                  </h3>
                  <p className="text-foreground-muted text-base leading-relaxed mb-6">
                    {problem.description}
                  </p>

                  <div className="pt-6 border-t-2 border-destructive/20">
                    <div className="text-4xl font-black text-destructive drop-shadow-glow">
                      {problem.stat}
                    </div>
                    <div className="text-sm font-medium text-foreground-subtle mt-2">
                      {problem.statLabel}
                    </div>
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solution Section - How It Works */}
      <section className="section relative">
        <div className="container">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card text-xs mb-4">
              <Zap className="w-3 h-3 text-accent" />
              <span className="text-foreground-muted uppercase tracking-wider">The Solution</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold mb-4">
              Analytics that actually
              <span className="gradient-text"> works</span>
            </h2>
            <p className="text-lg text-foreground-muted max-w-2xl mx-auto">
              One platform that connects, models, and delivers insights from all your data sources
            </p>
          </div>

          {/* Architecture Diagram */}
          <div className="relative mb-20">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-transparent to-accent/20 blur-3xl"></div>
            <div className="relative glass-card-premium p-4 shadow-4xl hover:scale-105 transition-all duration-700">
              <img
                src="/architecture-diagram.svg"
                alt="Platform Architecture"
                className="w-full h-auto rounded-xl"
              />
            </div>
          </div>

          {/* Interactive How It Works Tabs */}
          <Card variant="default" padding="lg">
            <div className="flex flex-wrap gap-2 mb-8 justify-center">
              {[
                { id: 'connect', label: 'Connect', icon: Database },
                { id: 'model', label: 'Model', icon: Brain },
                { id: 'explore', label: 'Explore', icon: Sparkles },
                { id: 'visualize', label: 'Visualize', icon: BarChart3 },
                { id: 'govern', label: 'Govern', icon: Shield },
              ].map((tab) => (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? 'secondary' : 'ghost'}
                  size="md"
                  onClick={() => setActiveTab(tab.id)}
                  className={
                    activeTab === tab.id
                      ? 'bg-primary/20 text-primary border border-primary/30'
                      : ''
                  }
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </Button>
              ))}
            </div>

            <div className="space-y-6">
              {activeTab === 'connect' && (
                <div className="grid md:grid-cols-2 gap-8 items-center">
                  <div>
                    <h3 className="text-2xl font-semibold mb-4">Connect in 10 minutes</h3>
                    <p className="text-foreground-muted mb-6">
                      Secure connection to your data sources with enterprise-grade authentication.
                      We automatically discover your databases, schemas, tables, and relationships.
                    </p>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
                        <span className="text-sm">Auto-discovery of schema and relationships</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
                        <span className="text-sm">Your data never leaves your systems</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
                        <span className="text-sm">Real-time sync with zero ETL</span>
                      </li>
                    </ul>
                  </div>
                  <div className="glass-card p-6 rounded-xl">
                    <div className="text-xs text-foreground-muted mb-2">CONNECTION STATUS</div>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                      <span className="text-sm font-medium">Connected to ANALYTICS_WH</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground-muted">Databases</span>
                        <span>12 discovered</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground-muted">Tables</span>
                        <span>847 indexed</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground-muted">Relationships</span>
                        <span>234 mapped</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'model' && (
                <div className="grid md:grid-cols-2 gap-8 items-center">
                  <div>
                    <h3 className="text-2xl font-semibold mb-4">AI-Assisted Semantic Layer</h3>
                    <p className="text-foreground-muted mb-6">
                      Define metrics once, use everywhere. Our AI helps you create business-friendly
                      definitions that ensure everyone uses the same calculations.
                    </p>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
                        <span className="text-sm">Pre-built templates for common metrics</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
                        <span className="text-sm">Version control and change tracking</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
                        <span className="text-sm">Business glossary with documentation</span>
                      </li>
                    </ul>
                  </div>
                  <div className="glass-card p-6 rounded-xl font-mono text-sm">
                    <div className="text-xs text-primary mb-2">// METRIC DEFINITION</div>
                    <div className="text-foreground/80">
                      <div>
                        <span className="text-primary">metric</span> monthly_recurring_revenue {`{`}
                      </div>
                      <div>
                        &nbsp;&nbsp;<span className="text-accent">label:</span> "MRR"
                      </div>
                      <div>
                        &nbsp;&nbsp;<span className="text-accent">type:</span> sum
                      </div>
                      <div>
                        &nbsp;&nbsp;<span className="text-accent">sql:</span> subscriptions.amount
                      </div>
                      <div>
                        &nbsp;&nbsp;<span className="text-accent">filters:</span> [
                      </div>
                      <div>&nbsp;&nbsp;&nbsp;&nbsp;status = 'active',</div>
                      <div>&nbsp;&nbsp;&nbsp;&nbsp;billing_period = 'monthly'</div>
                      <div>&nbsp;&nbsp;]</div>
                      <div>{`}`}</div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'explore' && (
                <div className="grid md:grid-cols-2 gap-8 items-center">
                  <div>
                    <h3 className="text-2xl font-semibold mb-4">Ask Questions in Plain English</h3>
                    <p className="text-foreground-muted mb-6">
                      No SQL required. Ask questions naturally and get instant, accurate answers.
                      Our AI understands your business context and data relationships.
                    </p>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
                        <span className="text-sm">Natural language to optimized SQL</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
                        <span className="text-sm">Suggested follow-up questions</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
                        <span className="text-sm">Query validation and cost estimates</span>
                      </li>
                    </ul>
                  </div>
                  <div className="glass-card p-6 rounded-xl">
                    <div className="flex items-center gap-2 mb-4">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">Natural Language Query</span>
                    </div>
                    <div className="p-3 rounded-lg bg-card mb-3">
                      <p className="text-sm">"Show me revenue by product category for Q4 2024"</p>
                    </div>
                    <div className="text-xs text-foreground-muted mb-2">GENERATED SQL</div>
                    <div className="p-3 rounded-lg bg-background/50 font-mono text-xs text-foreground/70">
                      <div>SELECT category, SUM(amount)</div>
                      <div>FROM orders</div>
                      <div>WHERE date {'>'}= '2024-10-01'</div>
                      <div>GROUP BY category</div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'visualize' && (
                <div className="grid md:grid-cols-2 gap-8 items-center">
                  <div>
                    <h3 className="text-2xl font-semibold mb-4">Beautiful Dashboards in Minutes</h3>
                    <p className="text-foreground-muted mb-6">
                      Drag-and-drop dashboard builder with smart defaults. Choose from templates or
                      let AI generate dashboards based on your data and goals.
                    </p>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
                        <span className="text-sm">50+ visualization types</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
                        <span className="text-sm">Real-time updates and auto-refresh</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
                        <span className="text-sm">Mobile-responsive and embeddable</span>
                      </li>
                    </ul>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="glass-card p-4 rounded-xl">
                      <div className="w-full h-20 bg-gradient-to-r from-primary/20 to-accent/20 rounded-lg mb-2" />
                      <div className="text-xs text-foreground-muted">Line Chart</div>
                    </div>
                    <div className="glass-card p-4 rounded-xl">
                      <div className="w-full h-20 bg-gradient-to-r from-accent/20 to-primary/20 rounded-lg mb-2" />
                      <div className="text-xs text-foreground-muted">Bar Chart</div>
                    </div>
                    <div className="glass-card p-4 rounded-xl">
                      <div className="w-full h-20 bg-gradient-to-r from-warning/20 to-success/20 rounded-lg mb-2" />
                      <div className="text-xs text-foreground-muted">Pie Chart</div>
                    </div>
                    <div className="glass-card p-4 rounded-xl">
                      <div className="w-full h-20 bg-gradient-to-r from-destructive/20 to-warning/20 rounded-lg mb-2" />
                      <div className="text-xs text-foreground-muted">Heatmap</div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'govern' && (
                <div className="grid md:grid-cols-2 gap-8 items-center">
                  <div>
                    <h3 className="text-2xl font-semibold mb-4">Enterprise-Grade Governance</h3>
                    <p className="text-foreground-muted mb-6">
                      Built-in data governance with PII detection, field-level security, and
                      complete audit trails. Stay compliant without sacrificing agility.
                    </p>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
                        <span className="text-sm">Automatic PII detection and masking</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
                        <span className="text-sm">Row and column-level security</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
                        <span className="text-sm">GDPR and HIPAA compliant</span>
                      </li>
                    </ul>
                  </div>
                  <div className="glass-card p-6 rounded-xl">
                    <div className="flex items-center gap-2 mb-4">
                      <Shield className="w-4 h-4 text-warning" />
                      <span className="text-sm font-medium">Security Policy Active</span>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-foreground-muted">PII Fields</span>
                        <span className="px-2 py-1 rounded-full bg-warning/20 text-warning text-xs">
                          12 masked
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-foreground-muted">RLS Policies</span>
                        <span className="px-2 py-1 rounded-full bg-success/20 text-success text-xs">
                          8 active
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-foreground-muted">Audit Events</span>
                        <span className="text-foreground">24,847 logged</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="section relative bg-gradient-to-b from-background to-background-secondary/30">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold mb-4">
              The impact is
              <span className="gradient-text"> immediate</span>
            </h2>
            <p className="text-lg text-foreground-muted max-w-2xl mx-auto">
              Teams using SME Analytics see measurable improvements in their first month
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {benefits.map((benefit, i) => (
              <div
                key={benefit.title}
                className="reveal-scale"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <Card
                  variant="premium"
                  padding="lg"
                  className="h-full hover:scale-110 hover:shadow-4xl transition-all duration-500 group"
                >
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 inline-block mb-6 group-hover:animate-glow-pulse shadow-xl">
                    <benefit.icon className="w-8 h-8 text-primary drop-shadow-glow" />
                  </div>

                  <div className="text-5xl font-black bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-4 text-shadow-glow bg-size-200 animate-gradient">
                    {benefit.metric}
                  </div>
                  <h3 className="text-xl font-bold mb-3">{benefit.title}</h3>
                  <p className="text-base text-foreground-muted leading-relaxed">
                    {benefit.description}
                  </p>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ROI Calculator Section */}
      <section className="section relative">
        <div className="container">
          <Card variant="premium" padding="xl" className="bg-gradient-subtle">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <Card
                  variant="default"
                  padding="sm"
                  className="inline-flex items-center gap-2 rounded-full text-xs mb-6 w-fit"
                >
                  <Calculator className="w-3 h-3 text-accent" />
                  <span className="text-foreground-muted uppercase tracking-wider">
                    ROI Calculator
                  </span>
                </Card>

                <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4">
                  Calculate your
                  <span className="gradient-text"> savings</span>
                </h2>

                <p className="text-foreground-muted mb-8">
                  See how much time and money you'll save with SME Analytics based on your current
                  setup.
                </p>

                <div className="space-y-6">
                  <div>
                    <label className="text-sm text-foreground-muted block mb-2">
                      Monthly data infrastructure spend
                    </label>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        size="icon-md"
                        onClick={() =>
                          setRoiInputs((prev) => ({
                            ...prev,
                            monthlyDataSpend: Math.max(1000, prev.monthlyDataSpend - 5000),
                          }))
                        }
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <Card variant="default" padding="sm" className="flex-1 text-center">
                        <div className="font-semibold">
                          ${roiInputs.monthlyDataSpend.toLocaleString()}
                        </div>
                      </Card>
                      <Button
                        variant="ghost"
                        size="icon-md"
                        onClick={() =>
                          setRoiInputs((prev) => ({
                            ...prev,
                            monthlyDataSpend: prev.monthlyDataSpend + 5000,
                          }))
                        }
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-foreground-muted block mb-2">
                      Number of data analysts
                    </label>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        size="icon-md"
                        onClick={() =>
                          setRoiInputs((prev) => ({
                            ...prev,
                            analysts: Math.max(1, prev.analysts - 1),
                          }))
                        }
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <Card variant="default" padding="sm" className="flex-1 text-center">
                        <div className="font-semibold">{roiInputs.analysts}</div>
                      </Card>
                      <Button
                        variant="ghost"
                        size="icon-md"
                        onClick={() =>
                          setRoiInputs((prev) => ({ ...prev, analysts: prev.analysts + 1 }))
                        }
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-foreground-muted block mb-2">
                      Dashboards per month
                    </label>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        size="icon-md"
                        onClick={() =>
                          setRoiInputs((prev) => ({
                            ...prev,
                            dashboards: Math.max(1, prev.dashboards - 5),
                          }))
                        }
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <Card variant="default" padding="sm" className="flex-1 text-center">
                        <div className="font-semibold">{roiInputs.dashboards}</div>
                      </Card>
                      <Button
                        variant="ghost"
                        size="icon-md"
                        onClick={() =>
                          setRoiInputs((prev) => ({ ...prev, dashboards: prev.dashboards + 5 }))
                        }
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <Card variant="premium" padding="xl" className="text-center shadow-4xl">
                  <div className="text-base font-medium text-foreground-muted mb-4">
                    Estimated Annual Savings
                  </div>
                  <div className="text-7xl font-black bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-8 text-shadow-glow bg-size-200 animate-gradient">
                    ${(savings / 1000).toFixed(0)}K
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <Card variant="default" padding="sm">
                      <div className="text-2xl font-bold text-success">{roi}%</div>
                      <div className="text-xs text-foreground-muted">ROI</div>
                    </Card>
                    <Card variant="default" padding="sm">
                      <div className="text-2xl font-bold text-primary">3 mo</div>
                      <div className="text-xs text-foreground-muted">Payback</div>
                    </Card>
                  </div>

                  <div className="relative mb-8">
                    <div className="absolute inset-0 bg-gradient-to-r from-accent/10 to-primary/10 blur-2xl"></div>
                    <img
                      src="/roi-visualization.svg"
                      alt="ROI Visualization"
                      className="relative w-full h-auto rounded-xl shadow-2xl border border-accent/20"
                    />
                  </div>

                  <Button variant="primary" size="md" asChild className="w-full justify-center">
                    <Link href="/signup">See Custom ROI Report</Link>
                  </Button>
                </Card>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="section relative">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold mb-4">
              Built for your
              <span className="gradient-text"> industry</span>
            </h2>
            <p className="text-lg text-foreground-muted max-w-2xl mx-auto">
              Pre-built semantic models and dashboards for common use cases
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {useCases.map((useCase, i) => (
              <div
                key={useCase.industry}
                className="reveal"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <Card
                  variant="default"
                  padding="lg"
                  className="h-full hover:border-primary/20 transition-all group"
                >
                  <div className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-4">
                    {useCase.industry}
                  </div>

                  <h3 className="text-xl font-semibold mb-3">{useCase.title}</h3>
                  <p className="text-foreground-muted text-sm mb-6">{useCase.description}</p>

                  <div className="grid grid-cols-2 gap-2">
                    {useCase.metrics.map((metric) => (
                      <div key={metric} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-success" />
                        <span className="text-foreground-muted">{metric}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="section relative bg-background-secondary/30">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold mb-4">
              Trusted by
              <span className="gradient-text"> 500+ data teams</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                quote:
                  'We went from 2 weeks to 2 hours for new dashboard requests. The semantic layer ensures everyone uses the same definitions. Game-changer.',
                author: 'Sarah Chen',
                role: 'VP Data, TechCorp',
                avatar: 'SC',
                rating: 5,
              },
              {
                quote:
                  'Finally, our business users can self-serve without breaking production queries. The NL→SQL is surprisingly accurate even with complex questions.',
                author: 'Michael Rodriguez',
                role: 'Head of Analytics, RetailPlus',
                avatar: 'MR',
                rating: 5,
              },
              {
                quote:
                  'Replaced Looker + dbt + Metabase with one tool. Saved $180K/year and our team is 3x more productive. Implementation took one afternoon.',
                author: 'Emma Thompson',
                role: 'Data Director, FinanceFlow',
                avatar: 'ET',
                rating: 5,
              },
            ].map((testimonial, i) => (
              <div
                key={testimonial.author}
                className="reveal"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <Card variant="default" padding="md" className="h-full">
                  <div className="flex gap-0.5 mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <div key={i} className="text-warning">
                        ★
                      </div>
                    ))}
                  </div>

                  <blockquote className="text-foreground/90 leading-relaxed mb-6">
                    "{testimonial.quote}"
                  </blockquote>

                  <div className="flex items-center gap-3 pt-4 border-t border-border">
                    <div className="w-10 h-10 rounded-full bg-gradient-brand flex items-center justify-center text-white text-sm font-semibold">
                      {testimonial.avatar}
                    </div>
                    <div>
                      <div className="font-medium">{testimonial.author}</div>
                      <div className="text-sm text-foreground-muted">{testimonial.role}</div>
                    </div>
                  </div>
                </Card>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <p className="text-sm text-foreground-muted mb-8">
              Join industry leaders already using SME Analytics
            </p>
            <div className="flex flex-wrap justify-center gap-x-12 gap-y-6 items-center opacity-60">
              {['Datadog', 'Stripe', 'Airbnb', 'Spotify', 'Netflix', 'Uber', 'Slack'].map(
                (company) => (
                  <div
                    key={company}
                    className="text-lg font-display text-foreground-muted hover:text-foreground transition-colors"
                  >
                    {company}
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="section relative">
        <div className="container max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold mb-4">
              Frequently asked
              <span className="gradient-text"> questions</span>
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <Card key={i} variant="default" padding="none" className="overflow-hidden">
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                  className="w-full justify-between px-6 py-4 text-left font-medium h-auto"
                >
                  <span className="pr-4">{faq.question}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-foreground-muted transition-transform ${
                      expandedFaq === i ? 'rotate-180' : ''
                    }`}
                  />
                </Button>
                {expandedFaq === i && (
                  <div className="px-6 pb-4">
                    <p className="text-foreground-muted text-sm leading-relaxed">{faq.answer}</p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section relative">
        <div className="container">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-brand p-px">
            <div className="relative rounded-3xl bg-background/95 backdrop-blur-xl p-12 lg:p-20">
              {/* Background decoration */}
              <div className="absolute inset-0 bg-mesh-gradient opacity-30" />

              <div className="relative z-10 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur text-xs mb-6">
                  <Zap className="w-3 h-3" />
                  <span className="uppercase tracking-wider">Limited Time Offer</span>
                </div>

                <h3 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold mb-4">
                  Start transforming your data
                  <span className="block mt-2">in the next 10 minutes</span>
                </h3>

                <p className="text-lg text-foreground/80 max-w-2xl mx-auto mb-8">
                  Join 500+ teams already getting answers from their data. 14-day free trial. No
                  credit card required.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
                  <Button variant="primary" size="lg" asChild>
                    <Link href="/signup">Start Free Trial</Link>
                  </Button>
                  <Button variant="secondary" size="lg" asChild>
                    <Link href="/demo">Book a Demo</Link>
                  </Button>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-8 text-sm">
                  <span className="flex items-center gap-2 text-foreground/60">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                    Free for 14 days
                  </span>
                  <span className="flex items-center gap-2 text-foreground/60">
                    <Users className="w-4 h-4 text-primary" />
                    No credit card
                  </span>
                  <span className="flex items-center gap-2 text-foreground/60">
                    <Zap className="w-4 h-4 text-warning" />
                    10-minute setup
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
