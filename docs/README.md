# 📚 Documentation

This folder contains all project documentation to keep the root directory clean.

## 📄 Available Documents

### [CLAUDE.md](./CLAUDE.md)
**AI Assistant Guidelines & Best Practices**

Comprehensive guide for working with AI assistants (like Claude) on this codebase. Includes:
- Next.js 15.3 + React 19 patterns
- Supabase integration best practices
- TypeScript conventions
- Database migration workflow
- Testing strategies
- Code organization

**Read this if:** You're using AI to help develop features or need to understand the project's architectural decisions.

---

### [STORYBOOK.md](./STORYBOOK.md)
**Component Development with Storybook**

Complete guide to using Storybook for isolated component development. Includes:
- Writing stories for components
- Testing different states and variants
- Accessibility testing
- Integration with Vitest
- Best practices and examples

**Read this if:** You're building UI components and want to test them in isolation before integration.

---

### [TEST_STRATEGY.md](./TEST_STRATEGY.md)
**Testing Approach & Guidelines**

Testing philosophy and practical examples for the project. Includes:
- What to test (and what not to test)
- Vitest setup and configuration
- Testing Server Actions
- Mocking Supabase
- Component testing patterns

**Read this if:** You're writing tests or want to understand the testing approach.

---

### [EDGE_FUNCTIONS_TESTING.md](./EDGE_FUNCTIONS_TESTING.md)
**Testing Supabase Edge Functions**

Guide for testing Supabase Edge Functions with Deno. Includes:
- Deno test setup
- Testing edge functions locally
- Mocking Supabase client
- Running tests in watch mode
- CI/CD integration

**Read this if:** You're working with Supabase Edge Functions and need to test them.

---

### [UPLOAD_FEATURE.md](./UPLOAD_FEATURE.md)
**File Upload Implementation Guide**

Complete implementation guide for file uploads using Supabase Storage and Uppy. Includes:
- Storage bucket configuration
- TUS protocol for resumable uploads
- React component implementation
- RLS policies for security
- Progress tracking

**Read this if:** You're implementing file upload functionality.

---

## 🗂️ Document Organization

```
docs/
├── README.md                      ← You are here
├── CLAUDE.md                      ← Project patterns & AI guidelines
├── STORYBOOK.md                   ← Component development
├── TEST_STRATEGY.md               ← Testing approach
├── EDGE_FUNCTIONS_TESTING.md      ← Edge function testing
└── UPLOAD_FEATURE.md              ← File upload feature
```

## 🆕 Adding New Documentation

When adding new documentation:

1. Create the `.md` file in this `docs/` folder
2. Add a summary entry to this README
3. Link to it from the main [README.md](../README.md) if relevant
4. Follow the existing documentation style:
   - Use clear section headers
   - Include code examples
   - Add practical use cases
   - Link to related docs

## 💡 Quick Tips

- **New to the project?** Start with [CLAUDE.md](./CLAUDE.md)
- **Building UI?** Check [STORYBOOK.md](./STORYBOOK.md)
- **Writing tests?** See [TEST_STRATEGY.md](./TEST_STRATEGY.md)
- **Need to add features?** [CLAUDE.md](./CLAUDE.md) has the patterns

---

**Note:** The main [README.md](../README.md) in the project root provides a quick overview and getting started guide. These documents provide deeper, feature-specific guidance.
