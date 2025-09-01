'use client';

import React, { useState } from 'react';
import {
  Button,
  Card,
  Input,
  Badge,
  Container,
  Section,
  typography,
  spacing,
} from '@/components/ui/design-system';
import {
  ArrowRight,
  Download,
  Heart,
  Star,
  Settings,
  User,
  Mail,
  Search,
  Plus,
} from 'lucide-react';

export default function DesignSystemDemo() {
  const [email, setEmail] = useState('');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <Section spacing="sm">
        <Container size="lg">
          <div className="text-center">
            <h1 className={typography['display-xl']}>Elev8 Design System</h1>
            <p className={typography['body-lg'] + ' text-foreground-muted mt-4'}>
              Comprehensive component library with standardized sizing, spacing, and typography
            </p>
          </div>
        </Container>
      </Section>

      {/* Button Showcase */}
      <Section spacing="md">
        <Container size="lg">
          <div className="space-y-8">
            <div>
              <h2 className={typography['heading-xl'] + ' mb-6'}>Button System</h2>
              <p className={typography['body-md'] + ' text-foreground-muted mb-8'}>
                Standardized button components with consistent sizing: Small (h-9 px-3), Medium
                (h-11 px-6), Large (h-14 px-8)
              </p>

              {/* Button Variants */}
              <div className="space-y-6">
                <Card variant="default" padding="lg">
                  <h3 className={typography['heading-md'] + ' mb-4'}>Primary Buttons</h3>
                  <div className="flex flex-wrap gap-4 items-end">
                    <Button variant="primary" size="sm">
                      Small <ArrowRight className="w-4 h-4" />
                    </Button>
                    <Button variant="primary" size="md">
                      Medium <ArrowRight className="w-5 h-5" />
                    </Button>
                    <Button variant="primary" size="lg">
                      Large <ArrowRight className="w-6 h-6" />
                    </Button>
                  </div>
                </Card>

                <Card variant="default" padding="lg">
                  <h3 className={typography['heading-md'] + ' mb-4'}>Secondary Buttons</h3>
                  <div className="flex flex-wrap gap-4 items-end">
                    <Button variant="secondary" size="sm">
                      <Download className="w-4 h-4" /> Small
                    </Button>
                    <Button variant="secondary" size="md">
                      <Download className="w-5 h-5" /> Medium
                    </Button>
                    <Button variant="secondary" size="lg">
                      <Download className="w-6 h-6" /> Large
                    </Button>
                  </div>
                </Card>

                <Card variant="default" padding="lg">
                  <h3 className={typography['heading-md'] + ' mb-4'}>All Variants (Medium Size)</h3>
                  <div className="flex flex-wrap gap-4">
                    <Button variant="primary">Primary</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button variant="outline">Outline</Button>
                    <Button variant="destructive">Destructive</Button>
                    <Button variant="link">Link</Button>
                  </div>
                </Card>

                <Card variant="default" padding="lg">
                  <h3 className={typography['heading-md'] + ' mb-4'}>Icon Buttons</h3>
                  <div className="flex flex-wrap gap-4 items-end">
                    <Button variant="primary" size="icon-sm">
                      <Heart className="w-4 h-4" />
                    </Button>
                    <Button variant="secondary" size="icon-md">
                      <Star className="w-5 h-5" />
                    </Button>
                    <Button variant="outline" size="icon-lg">
                      <Settings className="w-6 h-6" />
                    </Button>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* Card Showcase */}
      <Section spacing="md">
        <Container size="lg">
          <div>
            <h2 className={typography['heading-xl'] + ' mb-6'}>Card System</h2>
            <p className={typography['body-md'] + ' text-foreground-muted mb-8'}>
              Uniform card components with consistent padding based on 8px grid system
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card variant="default" padding="md">
                <h3 className={typography['heading-sm'] + ' mb-2'}>Default Card</h3>
                <p className={typography['body-sm'] + ' text-foreground-muted'}>
                  Standard glass morphism design with subtle backdrop blur.
                </p>
              </Card>

              <Card variant="premium" padding="md">
                <h3 className={typography['heading-sm'] + ' mb-2'}>Premium Card</h3>
                <p className={typography['body-sm'] + ' text-foreground-muted'}>
                  Enhanced glass effect with gradient overlay for premium features.
                </p>
              </Card>

              <Card variant="elevated" padding="md">
                <h3 className={typography['heading-sm'] + ' mb-2'}>Elevated Card</h3>
                <p className={typography['body-sm'] + ' text-foreground-muted'}>
                  Strong shadow and border with hover animations.
                </p>
              </Card>

              <Card variant="minimal" padding="md">
                <h3 className={typography['heading-sm'] + ' mb-2'}>Minimal Card</h3>
                <p className={typography['body-sm'] + ' text-foreground-muted'}>
                  Clean design for content-focused layouts.
                </p>
              </Card>
            </div>

            <div className="mt-8">
              <h3 className={typography['heading-lg'] + ' mb-4'}>Card Padding Variants</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card variant="default" padding="sm">
                  <div className="bg-primary/10 rounded p-2 text-center">
                    <span className={typography['label-sm']}>Small Padding (16px)</span>
                  </div>
                </Card>
                <Card variant="default" padding="md">
                  <div className="bg-primary/10 rounded p-2 text-center">
                    <span className={typography['label-sm']}>Medium Padding (24px)</span>
                  </div>
                </Card>
                <Card variant="default" padding="lg">
                  <div className="bg-primary/10 rounded p-2 text-center">
                    <span className={typography['label-sm']}>Large Padding (32px)</span>
                  </div>
                </Card>
                <Card variant="default" padding="xl">
                  <div className="bg-primary/10 rounded p-2 text-center">
                    <span className={typography['label-sm']}>Extra Large Padding (48px)</span>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* Form Components */}
      <Section spacing="md">
        <Container size="md">
          <Card variant="premium" padding="xl">
            <h2 className={typography['heading-xl'] + ' mb-6 text-center'}>Form Components</h2>

            <div className="space-y-6">
              <div>
                <label className={typography['label-md'] + ' block mb-2'}>Email Address</label>
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  size="md"
                />
              </div>

              <div>
                <label className={typography['label-md'] + ' block mb-2'}>Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-foreground-muted" />
                  <Input
                    type="search"
                    placeholder="Search for anything..."
                    className="pl-10"
                    variant="ghost"
                    size="lg"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <Button variant="primary" size="lg" className="flex-1">
                  <Mail className="w-5 h-5" />
                  Subscribe Now
                </Button>
                <Button variant="outline" size="lg">
                  <Plus className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </Card>
        </Container>
      </Section>

      {/* Typography & Spacing Showcase */}
      <Section spacing="md">
        <Container size="lg">
          <Card variant="minimal" padding="xl">
            <h2 className={typography['heading-xl'] + ' mb-8'}>Typography Scale</h2>

            <div className="space-y-6">
              <div>
                <h3 className={typography['heading-md'] + ' mb-4'}>Display Text</h3>
                <div className="space-y-4">
                  <div className={typography['display-sm']}>
                    Display Small - The future of analytics
                  </div>
                  <div className={typography['display-md']}>
                    Display Medium - Transform your data
                  </div>
                  <div className={typography['display-lg']}>Display Large - Insights</div>
                </div>
              </div>

              <div>
                <h3 className={typography['heading-md'] + ' mb-4'}>Headings</h3>
                <div className="space-y-3">
                  <div className={typography['heading-sm']}>Heading Small</div>
                  <div className={typography['heading-md']}>Heading Medium</div>
                  <div className={typography['heading-lg']}>Heading Large</div>
                  <div className={typography['heading-xl']}>Heading Extra Large</div>
                </div>
              </div>

              <div>
                <h3 className={typography['heading-md'] + ' mb-4'}>Body Text</h3>
                <div className="space-y-3">
                  <p className={typography['body-xs']}>
                    Extra small body text for fine print and captions
                  </p>
                  <p className={typography['body-sm']}>Small body text for secondary information</p>
                  <p className={typography['body-md']}>
                    Medium body text for main content paragraphs
                  </p>
                  <p className={typography['body-lg']}>
                    Large body text for important descriptions
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </Container>
      </Section>

      {/* Badges Showcase */}
      <Section spacing="md">
        <Container size="lg">
          <Card variant="default" padding="lg">
            <h2 className={typography['heading-xl'] + ' mb-6'}>Badge Components</h2>

            <div className="flex flex-wrap gap-3">
              <Badge variant="default">New Feature</Badge>
              <Badge variant="secondary">In Progress</Badge>
              <Badge variant="success">Completed</Badge>
              <Badge variant="warning">Pending Review</Badge>
              <Badge variant="destructive">Urgent</Badge>
              <Badge variant="outline">Draft</Badge>
            </div>
          </Card>
        </Container>
      </Section>

      {/* Spacing Demonstration */}
      <Section spacing="lg">
        <Container size="lg">
          <Card variant="elevated" padding="xl">
            <h2 className={typography['heading-xl'] + ' mb-8'}>8px Grid System</h2>

            <div className="space-y-4">
              <p className={typography['body-md'] + ' text-foreground-muted mb-8'}>
                All spacing follows a consistent 8px grid system for perfect alignment and visual
                harmony.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Object.entries(spacing).map(([key, value]) => (
                  <div key={key} className="text-center">
                    <div className="bg-primary/20 rounded p-2 mb-2">
                      <div
                        className="bg-primary rounded mx-auto"
                        style={{ width: value, height: '1rem' }}
                      />
                    </div>
                    <div className={typography['label-sm']}>
                      {key}: {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </Container>
      </Section>

      {/* Usage Examples */}
      <Section spacing="lg">
        <Container size="lg">
          <Card variant="premium" padding="xl">
            <h2 className={typography['display-md'] + ' mb-8 text-center gradient-text'}>
              Real-World Implementation
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* CTA Example */}
              <Card variant="default" padding="lg">
                <div className="text-center">
                  <h3 className={typography['heading-lg'] + ' mb-4'}>Ready to get started?</h3>
                  <p className={typography['body-md'] + ' text-foreground-muted mb-6'}>
                    Join thousands of teams already using our analytics platform.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Button variant="primary" size="lg">
                      Start Free Trial <ArrowRight className="w-5 h-5" />
                    </Button>
                    <Button variant="outline" size="lg">
                      View Demo
                    </Button>
                  </div>
                  <div className="flex justify-center gap-4 mt-6">
                    <Badge variant="success">14-day free trial</Badge>
                    <Badge variant="outline">No credit card required</Badge>
                  </div>
                </div>
              </Card>

              {/* Feature Card Example */}
              <Card variant="elevated" padding="lg">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-r from-primary to-accent rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <User className="w-8 h-8 text-white" />
                  </div>
                  <h3 className={typography['heading-md'] + ' mb-3'}>User Management</h3>
                  <p className={typography['body-sm'] + ' text-foreground-muted mb-4'}>
                    Complete user management system with role-based permissions and team
                    collaboration.
                  </p>
                  <Button variant="ghost" size="sm">
                    Learn More <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            </div>
          </Card>
        </Container>
      </Section>
    </div>
  );
}
