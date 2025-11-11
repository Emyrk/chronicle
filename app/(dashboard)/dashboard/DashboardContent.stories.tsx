import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { DashboardContent } from './DashboardContent'

const meta = {
  title: 'Pages/Dashboard',
  component: DashboardContent,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    user: {
      description: 'The authenticated user object',
      control: 'object',
    },
  },
  args: {
    onSignOut: fn(),
  },
} satisfies Meta<typeof DashboardContent>

export default meta
type Story = StoryObj<typeof meta>

export const AuthenticatedUser: Story = {
  args: {
    user: {
      email: 'user@example.com',
      id: '123e4567-e89b-12d3-a456-426614174000',
    },
  },
}

export const LongEmail: Story = {
  args: {
    user: {
      email: 'very.long.email.address.that.might.wrap@example.com',
      id: '123e4567-e89b-12d3-a456-426614174000',
    },
  },
}

export const NoUser: Story = {
  args: {
    user: null,
  },
}
