# Storybook Setup Guide

## 🎨 Overview

Storybook is now integrated into this project to provide an isolated component development environment. This allows you to:

- **Develop components in isolation** without running the full Next.js app
- **Verify components render properly** before integrating them
- **Test different states and props** interactively
- **Document components** with auto-generated docs
- **Visual regression testing** with accessibility checks

## 🚀 Quick Start

### Running Storybook

```bash
npm run storybook
```

This will start Storybook on [http://localhost:6006](http://localhost:6006)

### Building Storybook

```bash
npm run build-storybook
```

Builds a static version in `storybook-static/` for deployment.

## 📁 Where Stories Live

Stories are located next to their components:

```
components/
  ui/
    button.tsx
    button.stories.tsx  ← Story file
    card.tsx
    card.stories.tsx    ← Story file
```

Stories can also be in:
- `app/**/*.stories.tsx` - For page components
- `stories/**/*.stories.tsx` - For example stories

## ✍️ Writing Stories

### Basic Story Structure

```typescript
import type { Meta, StoryObj } from '@storybook/react'
import { MyComponent } from './my-component'

const meta = {
  title: 'UI/MyComponent',  // Path in Storybook sidebar
  component: MyComponent,
  parameters: {
    layout: 'centered',  // 'centered' | 'fullscreen' | 'padded'
  },
  tags: ['autodocs'],  // Auto-generate documentation
  argTypes: {
    // Control types for interactive props
    variant: {
      control: 'select',
      options: ['default', 'primary', 'secondary'],
    },
  },
} satisfies Meta<typeof MyComponent>

export default meta
type Story = StoryObj<typeof meta>

// Simple story with args
export const Default: Story = {
  args: {
    children: 'Click me',
    variant: 'default',
  },
}

// Story with custom render
export const CustomRender: Story = {
  render: () => (
    <div className="space-y-4">
      <MyComponent variant="primary">Primary</MyComponent>
      <MyComponent variant="secondary">Secondary</MyComponent>
    </div>
  ),
}
```

### Story Naming Conventions

- **Default** - The default/most common use case
- **Variants** - Different visual variants (Primary, Secondary, etc.)
- **States** - Different states (Loading, Error, Success)
- **WithData** - With realistic data
- **Interactive** - Demonstrates user interactions
- **AllVariants** - Showcase all variants together

### Layout Options

```typescript
parameters: {
  layout: 'centered',    // Component centered in canvas
  layout: 'fullscreen',  // Full viewport (for pages)
  layout: 'padded',      // Small padding around component
}
```

## 🎯 Example Stories

### Button with All Variants

```typescript
export const AllVariants: Story = {
  render: () => (
    <div className="flex gap-2">
      <Button variant="default">Default</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
    </div>
  ),
}
```

### Form Component with State

```typescript
export const WithFormState: Story = {
  render: () => {
    const [value, setValue] = useState('')
    return (
      <Input 
        value={value} 
        onChange={(e) => setValue(e.target.value)}
        placeholder="Type something..."
      />
    )
  },
}
```

### Component with Server Action (Mocked)

```typescript
import { fn } from '@storybook/test'

export const WithAction: Story = {
  args: {
    onSubmit: fn(),  // Mock function that logs to Actions panel
  },
}
```

## 🎨 Styling in Storybook

### Global Styles

Global styles (including Tailwind v4) are automatically imported via `.storybook/preview.ts`:

```typescript
import '../app/globals.css'
```

### Component-Specific Styles

Just use your Tailwind classes as normal:

```typescript
export const Styled: Story = {
  render: () => (
    <div className="p-4 bg-slate-100 rounded-lg">
      <MyComponent />
    </div>
  ),
}
```

## 🧪 Testing with Storybook

### Vitest Integration

Stories can be tested with `@storybook/addon-vitest`:

```typescript
// component.test.ts
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import * as stories from './component.stories'

const { Default } = composeStories(stories)

test('renders default story', () => {
  render(<Default />)
  expect(screen.getByText('Click me')).toBeInTheDocument()
})
```

### Accessibility Testing

The `@storybook/addon-a11y` addon is enabled and will:
- Highlight accessibility issues
- Show violations in the Accessibility panel
- Test against WCAG standards

## 📚 Addons Enabled

1. **@chromatic-com/storybook** - Visual regression testing
2. **@storybook/addon-docs** - Auto-generated documentation
3. **@storybook/addon-onboarding** - Interactive guide for new users
4. **@storybook/addon-a11y** - Accessibility testing
5. **@storybook/addon-vitest** - Vitest integration for testing stories

## 🔧 Configuration Files

### `.storybook/main.ts`

Main configuration file that:
- Defines story locations
- Configures addons
- Sets framework options

### `.storybook/preview.ts`

Preview configuration that:
- Imports global styles
- Sets default parameters
- Configures decorators

## 🎯 Best Practices

### 1. One Component, Multiple Stories

Create stories for different states:

```typescript
export const Default: Story = { args: { status: 'idle' } }
export const Loading: Story = { args: { status: 'loading' } }
export const Success: Story = { args: { status: 'success' } }
export const Error: Story = { args: { status: 'error' } }
```

### 2. Use Args for Interactive Controls

```typescript
argTypes: {
  size: {
    control: 'select',
    options: ['sm', 'md', 'lg'],
  },
  disabled: {
    control: 'boolean',
  },
  color: {
    control: 'color',
  },
}
```

### 3. Show Realistic Data

```typescript
const mockUser = {
  name: 'John Doe',
  email: 'john@example.com',
  avatar: '/avatars/john.jpg',
}

export const WithUser: Story = {
  args: {
    user: mockUser,
  },
}
```

### 4. Document Edge Cases

```typescript
export const LongText: Story = {
  args: {
    children: 'This is a very long text that might overflow the container...',
  },
}

export const EmptyState: Story = {
  args: {
    items: [],
  },
}
```

### 5. Group Related Stories

```typescript
const meta = {
  title: 'Forms/Input',  // Creates Forms category
  // ...
}
```

## 🚨 Common Issues

### Issue: Components don't render

**Solution**: Make sure you're importing from the correct path and the component is a named or default export.

### Issue: Styles not applied

**Solution**: Check that `app/globals.css` is imported in `.storybook/preview.ts`.

### Issue: Server Components in Stories

**Solution**: Storybook only supports Client Components. Extract client parts or mock server data:

```typescript
// Instead of Server Component
export const MyStory: Story = {
  render: () => {
    const mockData = { /* ... */ }  // Mock the server data
    return <ClientComponent data={mockData} />
  },
}
```

### Issue: Next.js specific features (Image, Link)

**Solution**: Storybook's Next.js framework handles these automatically, but you can also mock them:

```typescript
// .storybook/preview.tsx
import * as NextImage from 'next/image'

Object.defineProperty(NextImage, 'default', {
  configurable: true,
  value: (props) => <img {...props} />,
})
```

## 📖 Resources

- [Storybook for Next.js](https://storybook.js.org/docs/get-started/frameworks/nextjs)
- [Writing Stories](https://storybook.js.org/docs/writing-stories)
- [Component Story Format (CSF)](https://storybook.js.org/docs/api/csf)
- [Storybook Addons](https://storybook.js.org/docs/addons)

## 🎉 Quick Tips

1. **Use the Controls panel** to interactively change props
2. **Check the Accessibility panel** for a11y violations
3. **Use the Docs tab** for auto-generated documentation
4. **Press 'A' to toggle the addons panel**
5. **Press 'S' to toggle the sidebar**
6. **Use the toolbar** to test different viewports and themes

---

**Happy component building! 🎨**
